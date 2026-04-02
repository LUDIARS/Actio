/**
 * PM モジュール — API ルート
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { logActivity } from "../../src/activity-logger.js";
import {
  pmProjectRepo,
  pmTaskRepo,
  pmTaskSnapshotRepo,
  pmMilestoneRepo,
  pmTaskValidationRepo,
  pmConflictRepo,
  pmAnalyticsCacheRepo,
} from "../../src/db/repository.js";
import type {
  PMProject,
  PMTask,
  NewPMProject,
  NewPMTask,
} from "../../src/db/repository.js";
import { fetchGitHubIssues, fetchGitHubMilestones } from "./sync/github-sync.js";
import { fetchNotionTasks } from "./sync/notion-sync.js";
import { detectAllChanges, hashDescription } from "./sync/diff-detector.js";
import { pushDirtyTasks } from "./sync/writeback.js";
import { resolveConflict } from "./sync/conflict-resolver.js";
import { validateTask } from "./validation/task-validator.js";
import { calculateCriticalPath, findDecompositionCandidates } from "./analytics/critical-path.js";
import { generateGompertzReport } from "./analytics/gompertz.js";
import { findWarningTasks, findOverdueTasks, getDefaultReminderSettings } from "./reminder/deadline-checker.js";
import type {
  GitHubSourceConfig,
  NotionSourceConfig,
  SyncResult,
  ProgressReport,
  FullReport,
  ReminderSettings,
} from "./types.js";

export const pmRoutes = new Hono();

// ─── Projects ─────────────────────────────────────────────

pmRoutes.get("/projects", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const projects = await pmProjectRepo.findAll();
  return c.json({ projects });
});

pmRoutes.get("/projects/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const project = await pmProjectRepo.findById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(project);
});

pmRoutes.post("/projects", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    name: string;
    source: string;
    sourceConfig: Record<string, string>;
    syncIntervalMinutes?: number;
  }>();

  if (!body.name || !body.source || !body.sourceConfig) {
    return c.json({ error: "name, source, sourceConfig are required" }, 400);
  }

  if (body.source !== "github" && body.source !== "notion") {
    return c.json({ error: "source must be 'github' or 'notion'" }, 400);
  }

  const id = uuidv4();
  await pmProjectRepo.create({
    id,
    name: body.name,
    source: body.source,
    sourceConfig: body.sourceConfig,
    syncIntervalMinutes: body.syncIntervalMinutes ?? 15,
    ownerId: userId,
  });

  logActivity(userId, "", "PMプロジェクト作成", `「${body.name}」(${body.source})`);

  const project = await pmProjectRepo.findById(id);
  return c.json(project, 201);
});

pmRoutes.put("/projects/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const project = await pmProjectRepo.findById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = await c.req.json<{
    name?: string;
    sourceConfig?: Record<string, string>;
    syncIntervalMinutes?: number;
  }>();

  await pmProjectRepo.update(project.id, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.sourceConfig !== undefined ? { sourceConfig: body.sourceConfig } : {}),
    ...(body.syncIntervalMinutes !== undefined ? { syncIntervalMinutes: body.syncIntervalMinutes } : {}),
  });

  const updated = await pmProjectRepo.findById(project.id);
  return c.json(updated);
});

pmRoutes.delete("/projects/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const project = await pmProjectRepo.findById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  // 関連データも削除
  await pmTaskRepo.deleteByProject(project.id);
  await pmMilestoneRepo.deleteByProject(project.id);
  await pmAnalyticsCacheRepo.deleteByProject(project.id);
  await pmProjectRepo.deleteById(project.id);

  logActivity(userId, "", "PMプロジェクト削除", `「${project.name}」`);
  return c.json({ deleted: project.id });
});

// ─── Sync ─────────────────────────────────────────────────

pmRoutes.post("/projects/:id/sync", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const project = await pmProjectRepo.findById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const result = await performSync(project);

  await pmProjectRepo.update(project.id, {
    lastSyncedAt: new Date().toISOString(),
  });

  logActivity(userId, "", "PM同期実行", `「${project.name}」: +${result.created} ~${result.updated}`);
  return c.json({ result, lastSyncedAt: new Date().toISOString() });
});

pmRoutes.get("/projects/:id/sync/status", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const project = await pmProjectRepo.findById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  return c.json({
    projectId: project.id,
    lastSyncedAt: project.lastSyncedAt,
    status: "idle",
    lastResult: null,
  });
});

// ─── Tasks ────────────────────────────────────────────────

pmRoutes.get("/projects/:id/tasks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const tasks = await pmTaskRepo.findByProject(c.req.param("id"));
  return c.json({ tasks });
});

pmRoutes.get("/tasks/:taskId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const task = await pmTaskRepo.findById(c.req.param("taskId"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(task);
});

pmRoutes.put("/tasks/:taskId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const task = await pmTaskRepo.findById(c.req.param("taskId"));
  if (!task) return c.json({ error: "Task not found" }, 404);

  const body = await c.req.json<{
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignees?: string[];
    labels?: string[];
    dueDate?: string | null;
    estimatedHours?: number | null;
    blockedBy?: string[];
  }>();

  await pmTaskRepo.update(task.id, {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? {
      description: body.description,
      descriptionHash: hashDescription(body.description ?? null),
    } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.assignees !== undefined ? { assignees: body.assignees } : {}),
    ...(body.labels !== undefined ? { labels: body.labels } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
    ...(body.estimatedHours !== undefined ? { estimatedHours: body.estimatedHours } : {}),
    ...(body.blockedBy !== undefined ? { blockedBy: body.blockedBy } : {}),
    dirtyFlag: 1,
    localUpdatedAt: new Date().toISOString(),
  });

  const updated = await pmTaskRepo.findById(task.id);
  return c.json(updated);
});

pmRoutes.get("/tasks/:taskId/history", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const history = await pmTaskSnapshotRepo.findByTask(c.req.param("taskId"));
  return c.json({ history });
});

// ─── Conflicts ────────────────────────────────────────────

pmRoutes.get("/projects/:id/conflicts", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const conflicts = await pmConflictRepo.findByProject(c.req.param("id"), "pending");
  return c.json({ conflicts });
});

pmRoutes.post("/conflicts/:conflictId/resolve", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const conflict = await pmConflictRepo.findById(c.req.param("conflictId"));
  if (!conflict) return c.json({ error: "Conflict not found" }, 404);

  const body = await c.req.json<{
    resolution: string;
    resolvedData?: Record<string, unknown>;
  }>();

  await pmConflictRepo.update(conflict.id, {
    resolution: body.resolution,
    resolvedData: body.resolvedData ?? null,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  });

  return c.json({ message: "Conflict resolved" });
});

// ─── Validation ───────────────────────────────────────────

pmRoutes.post("/tasks/:taskId/validate", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

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

  const validationId = uuidv4();
  await pmTaskValidationRepo.create({
    id: validationId,
    taskId: task.id,
    score: result.score,
    issues: result.issues,
    suggestions: result.suggestions,
    relatedCommits: [],
    testFiles: [],
    validatedAt: result.validatedAt,
  });

  return c.json(result);
});

pmRoutes.get("/tasks/:taskId/validation", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const validation = await pmTaskValidationRepo.findLatestByTask(c.req.param("taskId"));
  if (!validation) return c.json({ error: "No validation found" }, 404);
  return c.json(validation);
});

// ─── Reminders ────────────────────────────────────────────

pmRoutes.get("/projects/:id/reminders", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  // デフォルト設定を返す (将来的にDB保存に拡張可能)
  return c.json(getDefaultReminderSettings());
});

pmRoutes.put("/projects/:id/reminders", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<ReminderSettings>();
  // 将来的にDB保存
  return c.json(body);
});

pmRoutes.post("/projects/:id/reminders/test", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const tasks = await pmTaskRepo.findByProject(c.req.param("id"));
  const settings = getDefaultReminderSettings();

  const warningTasks = findWarningTasks(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      assignees: t.assignees ?? [],
      projectId: t.projectId,
      status: t.status,
    })),
    settings
  );

  const overdueTasks = findOverdueTasks(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      assignees: t.assignees ?? [],
      projectId: t.projectId,
      status: t.status,
    }))
  );

  return c.json({
    message: "Test reminder check",
    warningCount: warningTasks.length,
    overdueCount: overdueTasks.length,
    warningTasks: warningTasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
    overdueTasks: overdueTasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
  });
});

// ─── Analytics ────────────────────────────────────────────

pmRoutes.get("/projects/:id/analytics/progress", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const projectId = c.req.param("id");
  const tasks = await pmTaskRepo.findByProject(projectId);

  const tasksByStatus: Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};
  let completedCount = 0;

  for (const task of tasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] ?? 0) + 1;
    tasksByPriority[task.priority] = (tasksByPriority[task.priority] ?? 0) + 1;
    if (task.status === "closed") completedCount++;
  }

  const report: ProgressReport = {
    projectId,
    totalTasks: tasks.length,
    completedTasks: completedCount,
    completionRate: tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) / 100 : 0,
    projectedCompletionDate: null,
    tasksByStatus,
    tasksByPriority,
  };

  return c.json(report);
});

pmRoutes.get("/projects/:id/analytics/critical-path", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const tasks = await pmTaskRepo.findByProject(c.req.param("id"));
  const result = calculateCriticalPath(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      estimatedHours: t.estimatedHours,
      assignees: t.assignees ?? [],
      blockedBy: t.blockedBy ?? [],
      dueDate: t.dueDate,
    }))
  );

  return c.json(result);
});

pmRoutes.get("/projects/:id/analytics/decomposition", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const tasks = await pmTaskRepo.findByProject(c.req.param("id"));
  const taskData = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    estimatedHours: t.estimatedHours,
    assignees: t.assignees ?? [],
    blockedBy: t.blockedBy ?? [],
    dueDate: t.dueDate,
  }));

  const criticalPath = calculateCriticalPath(taskData);
  const criticalPathIds = new Set(criticalPath.path.map((n) => n.taskId));
  const recommendations = findDecompositionCandidates(taskData, criticalPathIds);

  return c.json({ recommendations });
});

pmRoutes.get("/projects/:id/analytics/gompertz", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const projectId = c.req.param("id");
  const tasks = await pmTaskRepo.findByProject(projectId);

  // バグラベル付きタスクでゴンペルツ分析
  const bugTasks = tasks.filter((t) =>
    (t.labels ?? []).some((l: string) => l.toLowerCase().includes("bug"))
  );

  if (bugTasks.length < 3) {
    return c.json({
      projectId,
      generatedAt: new Date().toISOString(),
      totalBugsFound: bugTasks.length,
      totalBugsFixed: bugTasks.filter((t) => t.status === "closed").length,
      estimatedTotalBugs: 0,
      convergenceDate: null,
      confidenceLevel: 0,
      dataPoints: [],
      message: "バグデータが不十分です (最低3件必要)",
    });
  }

  // 日付ごとに累積集計
  const sorted = [...bugTasks].sort((a, b) =>
    (a.createdAt?.toString() ?? "").localeCompare(b.createdAt?.toString() ?? "")
  );

  let cumulativeFound = 0;
  let cumulativeFixed = 0;
  const dataPoints = sorted.map((t) => {
    cumulativeFound++;
    if (t.status === "closed") cumulativeFixed++;
    return {
      date: t.createdAt ? new Date(t.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      cumulativeFound,
      cumulativeFixed,
    };
  });

  const report = generateGompertzReport(projectId, dataPoints);
  return c.json(report);
});

pmRoutes.get("/projects/:id/analytics/report", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const projectId = c.req.param("id");
  const tasks = await pmTaskRepo.findByProject(projectId);

  const taskData = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    estimatedHours: t.estimatedHours,
    assignees: t.assignees ?? [],
    blockedBy: t.blockedBy ?? [],
    dueDate: t.dueDate,
    labels: t.labels ?? [],
    priority: t.priority,
    description: t.description,
    createdAt: t.createdAt,
  }));

  // Progress
  const tasksByStatus: Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};
  let completedCount = 0;
  for (const task of taskData) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] ?? 0) + 1;
    tasksByPriority[task.priority] = (tasksByPriority[task.priority] ?? 0) + 1;
    if (task.status === "closed") completedCount++;
  }

  const progress: ProgressReport = {
    projectId,
    totalTasks: taskData.length,
    completedTasks: completedCount,
    completionRate: taskData.length > 0 ? Math.round((completedCount / taskData.length) * 100) / 100 : 0,
    projectedCompletionDate: null,
    tasksByStatus,
    tasksByPriority,
  };

  // Critical Path
  const criticalPath = calculateCriticalPath(taskData);
  const criticalPathIds = new Set(criticalPath.path.map((n) => n.taskId));
  const decomposition = findDecompositionCandidates(taskData, criticalPathIds);

  const report: FullReport = {
    projectId,
    generatedAt: new Date().toISOString(),
    progress,
    criticalPath,
    decomposition,
    gompertz: null,
  };

  return c.json(report);
});

// ─── Sync Logic ───────────────────────────────────────────

async function performSync(project: PMProject): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    closed: 0,
    unchanged: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    // 外部からタスクを取得
    let externalTasks;
    if (project.source === "github") {
      const config = project.sourceConfig as unknown as GitHubSourceConfig;
      externalTasks = await fetchGitHubIssues(config);

      // マイルストーンも同期
      const milestones = await fetchGitHubMilestones(config);
      for (const ms of milestones) {
        const existing = await pmMilestoneRepo.findByExternalId(project.id, ms.externalId);
        if (existing) {
          await pmMilestoneRepo.update(existing.id, {
            title: ms.title,
            description: ms.description,
            dueDate: ms.dueDate,
            state: ms.state,
            externalUpdatedAt: ms.updatedAt,
          });
        } else {
          await pmMilestoneRepo.create({
            id: uuidv4(),
            projectId: project.id,
            externalId: ms.externalId,
            title: ms.title,
            description: ms.description,
            dueDate: ms.dueDate,
            state: ms.state,
            externalUpdatedAt: ms.updatedAt,
          });
        }
      }
    } else {
      const config = project.sourceConfig as unknown as NotionSourceConfig;
      externalTasks = await fetchNotionTasks(config);
    }

    // 既存タスクを取得
    const storedTasks = await pmTaskRepo.findByProject(project.id);
    const storedMap = new Map(storedTasks.map((t) => [t.externalId, t]));

    // 差分検出
    const { diffs } = detectAllChanges(
      externalTasks,
      storedTasks.map((t) => ({
        externalId: t.externalId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assignees: t.assignees ?? [],
        labels: t.labels ?? [],
        dueDate: t.dueDate,
        milestoneExternalId: t.milestoneExternalId,
        milestoneName: t.milestoneName,
        descriptionHash: t.descriptionHash,
      }))
    );

    for (const ext of externalTasks) {
      const stored = storedMap.get(ext.externalId);
      const diff = diffs.find((d) => d.taskExternalId === ext.externalId);

      if (!stored) {
        // 新規タスク
        const taskId = uuidv4();
        await pmTaskRepo.create({
          id: taskId,
          projectId: project.id,
          externalId: ext.externalId,
          externalUrl: ext.externalUrl,
          title: ext.title,
          description: ext.description,
          status: ext.status,
          priority: ext.priority,
          assignees: ext.assignees,
          labels: ext.labels,
          dueDate: ext.dueDate,
          milestoneExternalId: ext.milestoneExternalId,
          milestoneName: ext.milestoneName,
          descriptionHash: hashDescription(ext.description),
          externalUpdatedAt: ext.updatedAt,
          lastSyncedAt: new Date().toISOString(),
        });

        await pmTaskSnapshotRepo.create({
          id: uuidv4(),
          taskId,
          changeType: "created",
          changedFields: {},
          snapshotData: ext as unknown as Record<string, unknown>,
          detectedAt: new Date().toISOString(),
        });

        result.created++;
      } else if (diff) {
        // コンフリクトチェック
        const hasLocalChanges = stored.localUpdatedAt && stored.lastSyncedAt &&
          stored.localUpdatedAt > stored.lastSyncedAt;

        if (hasLocalChanges && stored.dirtyFlag === 1) {
          // コンフリクト検出
          const conflictResult = resolveConflict({
            taskId: stored.id,
            localVersion: stored as unknown as Record<string, unknown>,
            externalVersion: ext as unknown as Record<string, unknown>,
            baseVersion: stored as unknown as Record<string, unknown>,
          });

          if (conflictResult.resolution === "auto_field_merge") {
            await pmTaskRepo.update(stored.id, {
              ...conflictResult.mergedData as Partial<NewPMTask>,
              descriptionHash: hashDescription(ext.description),
              externalUpdatedAt: ext.updatedAt,
              lastSyncedAt: new Date().toISOString(),
              dirtyFlag: 0,
            });
            result.updated++;
          } else {
            // コンフリクトレコード作成
            await pmConflictRepo.create({
              id: uuidv4(),
              taskId: stored.id,
              projectId: project.id,
              localVersion: stored as unknown as Record<string, unknown>,
              externalVersion: ext as unknown as Record<string, unknown>,
              baseVersion: stored as unknown as Record<string, unknown>,
              resolution: conflictResult.resolution,
              resolvedData: conflictResult.mergedData,
              status: "pending",
              createdAt: new Date().toISOString(),
            });
            result.conflicts++;
          }
        } else {
          // 通常更新
          await pmTaskRepo.update(stored.id, {
            title: ext.title,
            description: ext.description,
            status: ext.status,
            priority: ext.priority,
            assignees: ext.assignees,
            labels: ext.labels,
            dueDate: ext.dueDate,
            milestoneExternalId: ext.milestoneExternalId,
            milestoneName: ext.milestoneName,
            descriptionHash: hashDescription(ext.description),
            externalUpdatedAt: ext.updatedAt,
            lastSyncedAt: new Date().toISOString(),
          });

          // スナップショット保存
          const changedFields: Record<string, { before: unknown; after: unknown }> = {};
          for (const change of diff.changes) {
            changedFields[change.field] = { before: change.before, after: change.after };
          }

          await pmTaskSnapshotRepo.create({
            id: uuidv4(),
            taskId: stored.id,
            changeType: diff.changeType,
            changedFields,
            snapshotData: ext as unknown as Record<string, unknown>,
            detectedAt: new Date().toISOString(),
          });

          if (diff.changeType === "closed") result.closed++;
          else result.updated++;
        }
      } else {
        result.unchanged++;
      }
    }

    // 書き戻し (dirty タスクを外部に反映)
    const dirtyTasks = await pmTaskRepo.findDirty(project.id);
    if (dirtyTasks.length > 0) {
      const writebackResult = await pushDirtyTasks(
        {
          id: project.id,
          source: project.source,
          sourceConfig: project.sourceConfig,
        },
        dirtyTasks.map((t) => ({
          id: t.id,
          externalId: t.externalId,
          title: t.title,
          description: t.description,
          status: t.status,
          labels: t.labels ?? [],
          assignees: t.assignees ?? [],
          milestoneExternalId: t.milestoneExternalId,
        }))
      );

      for (const successId of writebackResult.success) {
        await pmTaskRepo.update(successId, {
          dirtyFlag: 0,
          externalUpdatedAt: new Date().toISOString(),
        });
      }

      for (const fail of writebackResult.failed) {
        result.errors.push(`Writeback failed for ${fail.taskId}: ${fail.error}`);
      }
    }
  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}
