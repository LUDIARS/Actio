/**
 * WS Command Handlers — PM (Project Management) module
 *
 * REST (modules/pm/routes.ts) と同じユースケース・検証・トークンの扱いを使う。
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  pmAnalyticsCacheRepo,
  pmConflictRepo,
  pmMilestoneRepo,
  pmProjectRepo,
  pmTaskRepo,
  pmTaskSnapshotRepo,
  pmTaskValidationRepo,
} from "../../db/repository.js";
import { logActivity } from "../../activity-logger.js";
import { notifyUser } from "../broadcast.js";
import { hashDescription } from "../../../modules/pm/sync/diff-detector.js";
import { validateTask } from "../../../modules/pm/validation/task-validator.js";
import { resolveConflictManually, type ManualChoice } from "../../../modules/pm/application/resolve-conflict.js";
import { defaultSyncLock } from "../../../modules/pm/application/sync-project.js";
import { pmResolveDeps, runProjectSync, validateReviewTransitions } from "../../../modules/pm/infra/deps.js";
import { sealSourceConfig, toPublicProject } from "../../../modules/pm/secret/source-config.js";
import { PM_PRIORITIES, PM_SOURCES, PM_TASK_STATUSES } from "../../../modules/pm/types.js";

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function optionalInterval(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1440) {
    throw new Error("syncIntervalMinutes must be an integer between 1 and 1440");
  }
  return value;
}

// ── pm.create_project ──

registerCommand("pm", "create_project", async (userId, payload) => {
  const body = payload as Record<string, unknown>;
  const name = requireString(body.name, "name");
  const source = PM_SOURCES.find((s) => s === body.source);
  if (!source) throw new Error("source must be 'github' or 'notion'");

  const id = uuidv4();
  await pmProjectRepo.create({
    id,
    name,
    source,
    sourceConfig: sealSourceConfig(source, body.sourceConfig, null),
    syncIntervalMinutes: optionalInterval(body.syncIntervalMinutes) ?? 15,
    ownerId: userId,
  });

  logActivity(userId, "", "PMプロジェクト作成", `「${name}」(${source})`);
  const project = await pmProjectRepo.findById(id);
  return project ? toPublicProject(project) : { id };
});

// ── pm.update_project ──

registerCommand("pm", "update_project", async (_userId, payload) => {
  const body = payload as Record<string, unknown>;
  const project = await pmProjectRepo.findById(requireString(body.id, "id"));
  if (!project) throw new Error("Project not found");
  const source = PM_SOURCES.find((s) => s === project.source);
  if (!source) throw new Error(`未対応のソースです: ${project.source}`);
  const interval = optionalInterval(body.syncIntervalMinutes);

  await pmProjectRepo.update(project.id, {
    ...(typeof body.name === "string" && body.name.length > 0 ? { name: body.name } : {}),
    ...(body.sourceConfig !== undefined ? { sourceConfig: sealSourceConfig(source, body.sourceConfig, project.sourceConfig) } : {}),
    ...(interval !== undefined ? { syncIntervalMinutes: interval } : {}),
  });

  const updated = await pmProjectRepo.findById(project.id);
  return updated ? toPublicProject(updated) : { id: project.id };
});

// ── pm.delete_project ──

registerCommand("pm", "delete_project", async (userId, payload) => {
  const body = payload as Record<string, unknown>;
  const project = await pmProjectRepo.findById(requireString(body.id, "id"));
  if (!project) throw new Error("Project not found");
  if (defaultSyncLock.isRunning(project.id)) throw new Error("同期中のため削除できません");

  const taskIds = (await pmTaskRepo.findByProject(project.id)).map((t) => t.id);
  await pmTaskSnapshotRepo.deleteByTasks(taskIds);
  await pmTaskValidationRepo.deleteByTasks(taskIds);
  await pmConflictRepo.deleteByProject(project.id);
  await pmTaskRepo.deleteByProject(project.id);
  await pmMilestoneRepo.deleteByProject(project.id);
  await pmAnalyticsCacheRepo.deleteByProject(project.id);
  await pmProjectRepo.deleteById(project.id);

  logActivity(userId, "", "PMプロジェクト削除", `「${project.name}」`);
  return { deleted: project.id };
});

// ── pm.sync ──

registerCommand("pm", "sync", async (userId, payload) => {
  const body = payload as Record<string, unknown>;
  const project = await pmProjectRepo.findById(requireString(body.id, "id"));
  if (!project) throw new Error("Project not found");

  const result = await runProjectSync(project);
  logActivity(userId, "", "PM同期実行", `「${project.name}」: +${result.created} ~${result.updated}`);

  // プロジェクトオーナーに同期結果を通知（操作者と異なる場合）
  if (project.ownerId && project.ownerId !== userId) {
    notifyUser(project.ownerId, "pm.sync_completed", {
      projectId: project.id,
      projectName: project.name,
      created: result.created,
      updated: result.updated,
      conflicts: result.conflicts,
    });
  }

  return { result, lastSyncedAt: result.errors.length === 0 ? result.finishedAt : project.lastSyncedAt };
});

// ── pm.update_task ──

registerCommand("pm", "update_task", async (userId, payload) => {
  const body = payload as Record<string, unknown>;
  const task = await pmTaskRepo.findById(requireString(body.taskId, "taskId"));
  if (!task) throw new Error("Task not found");

  const status = body.status === undefined ? undefined : PM_TASK_STATUSES.find((s) => s === body.status);
  if (body.status !== undefined && !status) throw new Error("invalid status");
  const priority = body.priority === undefined ? undefined : PM_PRIORITIES.find((p) => p === body.priority);
  if (body.priority !== undefined && !priority) throw new Error("invalid priority");
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;

  await pmTaskRepo.update(task.id, {
    ...(typeof body.title === "string" && body.title.length > 0 ? { title: body.title } : {}),
    ...(body.description !== undefined ? {
      description: typeof body.description === "string" ? body.description : null,
      descriptionHash: hashDescription(typeof body.description === "string" ? body.description : null),
    } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(strings(body.assignees) ? { assignees: strings(body.assignees) } : {}),
    ...(strings(body.labels) ? { labels: strings(body.labels) } : {}),
    ...(body.dueDate !== undefined ? { dueDate: typeof body.dueDate === "string" ? body.dueDate : null } : {}),
    ...(body.estimatedHours !== undefined ? { estimatedHours: typeof body.estimatedHours === "number" ? body.estimatedHours : null } : {}),
    ...(strings(body.blockedBy) ? { blockedBy: strings(body.blockedBy) } : {}),
    dirtyFlag: 1,
    localUpdatedAt: new Date().toISOString(),
  });
  await pmAnalyticsCacheRepo.deleteByProject(task.projectId);

  const updated = await pmTaskRepo.findById(task.id);
  const project = await pmProjectRepo.findById(task.projectId);
  if (project && status === "review" && task.status !== "review") validateReviewTransitions(project, [task.id]);

  // プロジェクトオーナーにタスク更新を通知
  if (project?.ownerId && project.ownerId !== userId) {
    notifyUser(project.ownerId, "pm.task_updated", {
      projectId: task.projectId,
      taskId: task.id,
      title: updated?.title || task.title,
    });
  }

  return updated;
});

// ── pm.resolve_conflict ──

registerCommand("pm", "resolve_conflict", async (_userId, payload) => {
  const body = payload as Record<string, unknown>;
  const conflictId = requireString(body.conflictId, "conflictId");
  let choice: ManualChoice;
  if (body.resolution === "force_external" || body.resolution === "keep_local") choice = { kind: body.resolution };
  else if (body.resolution === "manual" && body.resolvedData) choice = { kind: "manual", data: body.resolvedData };
  else throw new Error("resolution must be force_external, keep_local, or manual with resolvedData");

  const outcome = await resolveConflictManually(conflictId, choice, pmResolveDeps);
  return { message: "Conflict resolved", ...outcome };
});

// ── pm.validate_task ──

registerCommand("pm", "validate_task", async (_userId, payload) => {
  const body = payload as Record<string, unknown>;
  const task = await pmTaskRepo.findById(requireString(body.taskId, "taskId"));
  if (!task) throw new Error("Task not found");

  const result = validateTask({
    id: task.id,
    title: task.title,
    description: task.description,
    labels: task.labels ?? [],
    estimatedHours: task.estimatedHours,
    blockedBy: task.blockedBy ?? [],
    status: task.status,
  });

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

  return result;
});
