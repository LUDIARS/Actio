/**
 * PM モジュール — API ルート
 *
 * 業務判断は domain/、手順は application/、外部 I/O と永続化は infra/ にある。
 * ここは入力の検証・応答の形・HTTP ステータスの対応だけを持つ。
 */

import { Hono, type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getUserId } from "../../src/middleware/getUserId.js";
import { logActivity } from "../../src/activity-logger.js";
import {
  pmAnalyticsCacheRepo,
  pmConflictRepo,
  pmMilestoneRepo,
  pmProjectRepo,
  pmTaskRepo,
  pmTaskSnapshotRepo,
  pmTaskValidationRepo,
  type PMProject,
} from "../../src/db/repository.js";
import { hashDescription } from "./sync/diff-detector.js";
import { validateTask } from "./validation/task-validator.js";
import { calculateCriticalPath, findDecompositionCandidates } from "./analytics/critical-path.js";
import {
  buildGompertzReport,
  buildProgressReport,
  cachedFullReport,
  type AnalyticsInput,
} from "./application/analytics-report.js";
import { autoMergeConflict, ConflictResolutionError, resolveConflictManually, type ManualChoice } from "./application/resolve-conflict.js";
import { collectStatusChangeEvidence } from "./application/status-change-validation.js";
import { defaultSyncLock, SyncInProgressError } from "./application/sync-project.js";
import { findOverdueTasks, findWarningTasks, reminderSettingsSchema, resolveReminderSettings } from "./reminder/deadline-checker.js";
import { MergeProviderUnavailableError } from "./llm/merge-client.js";
import { commitSourceFor } from "./infra/external-source.js";
import { createMergeModel, pmResolveDeps, runProjectSync, validateReviewTransitions } from "./infra/deps.js";
import { pmReportCache } from "./infra/repo-store.js";
import { sealSourceConfig, SourceConfigError, toPublicProject } from "./secret/source-config.js";
import { PmSecretKeyMissingError } from "./secret/token-box.js";
import { PM_PRIORITIES, PM_SOURCES, PM_TASK_STATUSES } from "./types.js";

export const pmRoutes = new Hono();

const syncIntervalSchema = z.number().int().min(1).max(1440);

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.enum(PM_SOURCES),
  sourceConfig: z.record(z.string(), z.unknown()),
  syncIntervalMinutes: syncIntervalSchema.optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sourceConfig: z.record(z.string(), z.unknown()).optional(),
  syncIntervalMinutes: syncIntervalSchema.optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(1000).optional(),
  description: z.string().max(200_000).nullable().optional(),
  status: z.enum(PM_TASK_STATUSES).optional(),
  priority: z.enum(PM_PRIORITIES).optional(),
  assignees: z.array(z.string().max(200)).max(100).optional(),
  labels: z.array(z.string().max(200)).max(200).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimatedHours: z.number().min(0).max(10_000).nullable().optional(),
  blockedBy: z.array(z.string().max(200)).max(200).optional(),
});

const resolveSchema = z.object({
  resolution: z.enum(["force_external", "keep_local", "manual"]),
  resolvedData: z.record(z.string(), z.unknown()).optional(),
});

type Json = Record<string, unknown>;

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function invalid(c: Context, error: z.ZodError) {
  return c.json({ error: "Invalid request", issues: error.issues.map((i) => i.path.join(".") || i.message) }, 400);
}

function configError(c: Context, error: unknown) {
  if (error instanceof SourceConfigError) return c.json({ error: error.message }, 400);
  if (error instanceof PmSecretKeyMissingError) return c.json({ error: error.message }, 503);
  throw error;
}

async function loadProject(id: string): Promise<PMProject | undefined> {
  return pmProjectRepo.findById(id);
}

async function analyticsInput(projectId: string): Promise<AnalyticsInput> {
  const tasks = await pmTaskRepo.findByProject(projectId);
  const snapshots = await pmTaskSnapshotRepo.findByTasks(tasks.map((t) => t.id));
  return { projectId, tasks, snapshots, now: new Date() };
}

function analysisTasks(tasks: Awaited<ReturnType<typeof pmTaskRepo.findByProject>>) {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    estimatedHours: t.estimatedHours,
    assignees: t.assignees ?? [],
    blockedBy: t.blockedBy ?? [],
    dueDate: t.dueDate,
  }));
}

pmRoutes.use("*", async (c, next) => {
  if (!getUserId(c)) return c.json({ error: "Authentication required" }, 401);
  await next();
});

// ─── Projects ─────────────────────────────────────────────

pmRoutes.get("/projects", async (c) => {
  const projects = await pmProjectRepo.findAll();
  return c.json({ projects: projects.map(toPublicProject) });
});

pmRoutes.get("/projects/:id", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(toPublicProject(project));
});

pmRoutes.post("/projects", async (c) => {
  const userId = getUserId(c) as string;
  const parsed = createProjectSchema.safeParse(await readJson(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const body = parsed.data;

  let sourceConfig: Record<string, string>;
  try {
    sourceConfig = sealSourceConfig(body.source, body.sourceConfig, null);
  } catch (error) {
    return configError(c, error);
  }

  const id = uuidv4();
  await pmProjectRepo.create({
    id,
    name: body.name,
    source: body.source,
    sourceConfig,
    syncIntervalMinutes: body.syncIntervalMinutes ?? 15,
    ownerId: userId,
  });

  logActivity(userId, "", "PMプロジェクト作成", `「${body.name}」(${body.source})`);
  const project = await loadProject(id);
  return c.json(project ? toPublicProject(project) : { id }, 201);
});

pmRoutes.put("/projects/:id", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const parsed = updateProjectSchema.safeParse(await readJson(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const body = parsed.data;

  let sourceConfig: Record<string, string> | undefined;
  if (body.sourceConfig !== undefined) {
    const source = PM_SOURCES.find((s) => s === project.source);
    if (!source) return c.json({ error: `未対応のソースです: ${project.source}` }, 400);
    try {
      sourceConfig = sealSourceConfig(source, body.sourceConfig, project.sourceConfig);
    } catch (error) {
      return configError(c, error);
    }
  }

  await pmProjectRepo.update(project.id, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(sourceConfig !== undefined ? { sourceConfig } : {}),
    ...(body.syncIntervalMinutes !== undefined ? { syncIntervalMinutes: body.syncIntervalMinutes } : {}),
  });

  const updated = await loadProject(project.id);
  return c.json(updated ? toPublicProject(updated) : { id: project.id });
});

pmRoutes.delete("/projects/:id", async (c) => {
  const userId = getUserId(c) as string;
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (defaultSyncLock.isRunning(project.id)) return c.json({ error: "同期中のため削除できません" }, 409);

  const taskIds = (await pmTaskRepo.findByProject(project.id)).map((t) => t.id);
  await pmTaskSnapshotRepo.deleteByTasks(taskIds);
  await pmTaskValidationRepo.deleteByTasks(taskIds);
  await pmConflictRepo.deleteByProject(project.id);
  await pmTaskRepo.deleteByProject(project.id);
  await pmMilestoneRepo.deleteByProject(project.id);
  await pmAnalyticsCacheRepo.deleteByProject(project.id);
  await pmProjectRepo.deleteById(project.id);

  logActivity(userId, "", "PMプロジェクト削除", `「${project.name}」`);
  return c.json({ deleted: project.id });
});

// ─── Sync ─────────────────────────────────────────────────

pmRoutes.post("/projects/:id/sync", async (c) => {
  const userId = getUserId(c) as string;
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  try {
    const result = await runProjectSync(project);
    logActivity(userId, "", "PM同期実行", `「${project.name}」: +${result.created} ~${result.updated}`);
    return c.json({ result, lastSyncedAt: result.errors.length === 0 ? result.finishedAt : project.lastSyncedAt });
  } catch (error) {
    if (error instanceof SyncInProgressError) return c.json({ error: error.message }, 409);
    throw error;
  }
});

pmRoutes.get("/projects/:id/sync/status", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const lastResult = project.lastSyncResult ?? null;
  const errors = Array.isArray(lastResult?.errors) ? lastResult.errors : [];
  const status = defaultSyncLock.isRunning(project.id) ? "syncing" : errors.length > 0 ? "error" : "idle";
  return c.json({ projectId: project.id, lastSyncedAt: project.lastSyncedAt, status, lastResult });
});

// ─── Tasks ────────────────────────────────────────────────

pmRoutes.get("/projects/:id/tasks", async (c) => {
  const tasks = await pmTaskRepo.findByProject(c.req.param("id"));
  return c.json({ tasks });
});

pmRoutes.get("/tasks/:taskId", async (c) => {
  const task = await pmTaskRepo.findById(c.req.param("taskId"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(task);
});

pmRoutes.put("/tasks/:taskId", async (c) => {
  const task = await pmTaskRepo.findById(c.req.param("taskId"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  const parsed = updateTaskSchema.safeParse(await readJson(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const body = parsed.data;

  await pmTaskRepo.update(task.id, {
    ...body,
    ...(body.description !== undefined ? { descriptionHash: hashDescription(body.description) } : {}),
    dirtyFlag: 1,
    localUpdatedAt: new Date().toISOString(),
  });
  await pmAnalyticsCacheRepo.deleteByProject(task.projectId);

  if (body.status === "review" && task.status !== "review") {
    const project = await loadProject(task.projectId);
    if (project) validateReviewTransitions(project, [task.id]);
  }

  const updated = await pmTaskRepo.findById(task.id);
  return c.json(updated);
});

pmRoutes.get("/tasks/:taskId/history", async (c) => {
  const history = await pmTaskSnapshotRepo.findByTask(c.req.param("taskId"));
  return c.json({ history });
});

// ─── Conflicts ────────────────────────────────────────────

pmRoutes.get("/projects/:id/conflicts", async (c) => {
  const conflicts = await pmConflictRepo.findByProject(c.req.param("id"), "pending");
  return c.json({ conflicts });
});

function conflictError(c: Context, error: unknown) {
  if (error instanceof ConflictResolutionError) return c.json({ error: error.message }, error.status);
  if (error instanceof MergeProviderUnavailableError) return c.json({ error: error.message }, 503);
  throw error;
}

pmRoutes.post("/conflicts/:conflictId/resolve", async (c) => {
  const parsed = resolveSchema.safeParse(await readJson(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const { resolution, resolvedData } = parsed.data;
  if (resolution === "manual" && !resolvedData) return c.json({ error: "manual では resolvedData が必要です" }, 400);
  const choice: ManualChoice = resolution === "manual" ? { kind: "manual", data: resolvedData } : { kind: resolution };

  try {
    const outcome = await resolveConflictManually(c.req.param("conflictId"), choice, pmResolveDeps);
    return c.json({ message: "Conflict resolved", ...outcome });
  } catch (error) {
    return conflictError(c, error);
  }
});

pmRoutes.post("/conflicts/:conflictId/auto-merge", async (c) => {
  const model = createMergeModel();
  if (!model.isConfigured()) return c.json({ error: "LLM マージの提供元が未設定です。手動で解決してください" }, 503);
  try {
    const outcome = await autoMergeConflict(c.req.param("conflictId"), model, pmResolveDeps, c.req.raw.signal);
    return c.json({ message: "Conflict merged", ...outcome });
  } catch (error) {
    return conflictError(c, error);
  }
});

// ─── Validation ───────────────────────────────────────────

pmRoutes.post("/tasks/:taskId/validate", async (c) => {
  const task = await pmTaskRepo.findById(c.req.param("taskId"));
  if (!task) return c.json({ error: "Task not found" }, 404);

  const result = validateTask({
    id: task.id,
    title: task.title,
    description: task.description,
    labels: task.labels ?? [],
    estimatedHours: task.estimatedHours,
    blockedBy: task.blockedBy ?? [],
    status: task.status,
  });

  // 関連コミット・テストは直近の検証結果 (review への変更時に収集) を引き継ぐ
  const previous = await pmTaskValidationRepo.findLatestByTask(task.id);
  await pmTaskValidationRepo.create({
    id: uuidv4(),
    taskId: task.id,
    score: result.score,
    issues: result.issues,
    suggestions: result.suggestions,
    relatedCommits: previous?.relatedCommits ?? [],
    testFiles: previous?.testFiles ?? [],
    validatedAt: result.validatedAt,
  });

  return c.json(result);
});

pmRoutes.get("/tasks/:taskId/validation", async (c) => {
  const validation = await pmTaskValidationRepo.findLatestByTask(c.req.param("taskId"));
  if (!validation) return c.json({ error: "No validation found" }, 404);
  return c.json(validation);
});

async function evidenceFor(c: Context) {
  const task = await pmTaskRepo.findById(c.req.param("taskId") ?? "");
  if (!task) return null;
  const project = await loadProject(task.projectId);
  if (!project) return null;
  return collectStatusChangeEvidence(task, commitSourceFor(project));
}

pmRoutes.get("/tasks/:taskId/related-commits", async (c) => {
  const evidence = await evidenceFor(c);
  if (!evidence) return c.json({ error: "Task not found" }, 404);
  return c.json({
    taskId: evidence.taskId,
    relatedCommits: evidence.relatedCommits,
    affectedFiles: evidence.affectedFiles,
    error: evidence.error,
  });
});

pmRoutes.get("/tasks/:taskId/test-coverage", async (c) => {
  const evidence = await evidenceFor(c);
  if (!evidence) return c.json({ error: "Task not found" }, 404);
  return c.json({
    taskId: evidence.taskId,
    testFiles: evidence.testFiles,
    testCoverage: evidence.testCoverage,
    error: evidence.error,
  });
});

// ─── Reminders ────────────────────────────────────────────

pmRoutes.get("/projects/:id/reminders", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(resolveReminderSettings(project.reminderSettings));
});

pmRoutes.put("/projects/:id/reminders", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const parsed = reminderSettingsSchema.safeParse(await readJson(c));
  if (!parsed.success) return invalid(c, parsed.error);

  await pmProjectRepo.update(project.id, { reminderSettings: parsed.data });
  return c.json(parsed.data);
});

/** 送らずに、いまの設定で対象になるタスクを返す (確認用)。 */
pmRoutes.post("/projects/:id/reminders/test", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const settings = resolveReminderSettings(project.reminderSettings);
  const tasks = (await pmTaskRepo.findByProject(project.id)).map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    assignees: t.assignees ?? [],
    projectId: t.projectId,
    status: t.status,
  }));
  const warningTasks = findWarningTasks(tasks, settings);
  const overdueTasks = settings.overdueCheckEnabled ? findOverdueTasks(tasks) : [];

  return c.json({
    message: "Test reminder check",
    settings,
    warningCount: warningTasks.length,
    overdueCount: overdueTasks.length,
    warningTasks: warningTasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
    overdueTasks: overdueTasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
  });
});

// ─── Analytics ────────────────────────────────────────────

pmRoutes.get("/projects/:id/analytics/progress", async (c) => {
  const input = await analyticsInput(c.req.param("id"));
  const criticalPath = calculateCriticalPath(analysisTasks(input.tasks));
  return c.json(buildProgressReport(input, new Set(criticalPath.path.map((n) => n.taskId))));
});

pmRoutes.get("/projects/:id/analytics/critical-path", async (c) => {
  const tasks = await pmTaskRepo.findByProject(c.req.param("id"));
  return c.json(calculateCriticalPath(analysisTasks(tasks)));
});

pmRoutes.get("/projects/:id/analytics/decomposition", async (c) => {
  const taskData = analysisTasks(await pmTaskRepo.findByProject(c.req.param("id")));
  const criticalPath = calculateCriticalPath(taskData);
  const recommendations = findDecompositionCandidates(taskData, new Set(criticalPath.path.map((n) => n.taskId)));
  return c.json({ recommendations });
});

pmRoutes.get("/projects/:id/analytics/gompertz", async (c) => {
  const report = buildGompertzReport(await analyticsInput(c.req.param("id")));
  const payload: Json = { ...report };
  if (report.dataPoints.length < 3) payload.message = "バグデータが不十分です (最低3日分必要)";
  return c.json(payload);
});

pmRoutes.get("/projects/:id/analytics/report", async (c) => {
  const project = await loadProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const report = await cachedFullReport(project, () => analyticsInput(project.id), pmReportCache);
  return c.json(report);
});
