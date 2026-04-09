/**
 * WS Command Handlers — PM (Project Management) module
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  pmProjectRepo,
  pmTaskRepo,
  pmTaskSnapshotRepo,
  pmMilestoneRepo,
  pmTaskValidationRepo,
  pmConflictRepo,
  pmAnalyticsCacheRepo,
} from "../../db/repository.js";
import type { NewPMTask } from "../../db/repository.js";
import { logActivity } from "../../activity-logger.js";
import { notifyUser } from "../broadcast.js";
import { fetchGitHubIssues, fetchGitHubMilestones } from "../../../modules/pm/sync/github-sync.js";
import { fetchNotionTasks } from "../../../modules/pm/sync/notion-sync.js";
import { detectAllChanges, hashDescription } from "../../../modules/pm/sync/diff-detector.js";
import { pushDirtyTasks } from "../../../modules/pm/sync/writeback.js";
import { resolveConflict } from "../../../modules/pm/sync/conflict-resolver.js";
import { validateTask } from "../../../modules/pm/validation/task-validator.js";
import type {
  GitHubSourceConfig,
  NotionSourceConfig,
  SyncResult,
} from "../../../modules/pm/types.js";

// ── pm.create_project ──

interface CreateProjectPayload {
  name: string;
  source: string;
  sourceConfig: Record<string, string>;
  syncIntervalMinutes?: number;
}

registerCommand("pm", "create_project", async (userId, payload) => {
  const body = payload as CreateProjectPayload;

  if (!body.name || !body.source || !body.sourceConfig) {
    throw new Error("name, source, sourceConfig are required");
  }
  if (body.source !== "github" && body.source !== "notion") {
    throw new Error("source must be 'github' or 'notion'");
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
  return project;
});

// ── pm.update_project ──

interface UpdateProjectPayload {
  id: string;
  name?: string;
  sourceConfig?: Record<string, string>;
  syncIntervalMinutes?: number;
}

registerCommand("pm", "update_project", async (userId, payload) => {
  const body = payload as UpdateProjectPayload;
  if (!body.id) throw new Error("id is required");

  const project = await pmProjectRepo.findById(body.id);
  if (!project) throw new Error("Project not found");

  await pmProjectRepo.update(project.id, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.sourceConfig !== undefined ? { sourceConfig: body.sourceConfig } : {}),
    ...(body.syncIntervalMinutes !== undefined ? { syncIntervalMinutes: body.syncIntervalMinutes } : {}),
  });

  const updated = await pmProjectRepo.findById(project.id);
  return updated;
});

// ── pm.delete_project ──

interface DeleteProjectPayload {
  id: string;
}

registerCommand("pm", "delete_project", async (userId, payload) => {
  const body = payload as DeleteProjectPayload;
  if (!body.id) throw new Error("id is required");

  const project = await pmProjectRepo.findById(body.id);
  if (!project) throw new Error("Project not found");

  await pmTaskRepo.deleteByProject(project.id);
  await pmMilestoneRepo.deleteByProject(project.id);
  await pmAnalyticsCacheRepo.deleteByProject(project.id);
  await pmProjectRepo.deleteById(project.id);

  logActivity(userId, "", "PMプロジェクト削除", `「${project.name}」`);
  return { deleted: project.id };
});

// ── pm.sync ──

interface SyncPayload {
  id: string;
}

registerCommand("pm", "sync", async (userId, payload) => {
  const body = payload as SyncPayload;
  if (!body.id) throw new Error("id is required");

  const project = await pmProjectRepo.findById(body.id);
  if (!project) throw new Error("Project not found");

  const result = await performSync(project);

  await pmProjectRepo.update(project.id, {
    lastSyncedAt: new Date().toISOString(),
  });

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

  return { result, lastSyncedAt: new Date().toISOString() };
});

// ── pm.update_task ──

interface UpdateTaskPayload {
  taskId: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignees?: string[];
  labels?: string[];
  dueDate?: string | null;
  estimatedHours?: number | null;
  blockedBy?: string[];
}

registerCommand("pm", "update_task", async (userId, payload) => {
  const body = payload as UpdateTaskPayload;
  if (!body.taskId) throw new Error("taskId is required");

  const task = await pmTaskRepo.findById(body.taskId);
  if (!task) throw new Error("Task not found");

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

  // プロジェクトオーナーにタスク更新を通知
  const project = await pmProjectRepo.findById(task.projectId);
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

interface ResolveConflictPayload {
  conflictId: string;
  resolution: string;
  resolvedData?: Record<string, unknown>;
}

registerCommand("pm", "resolve_conflict", async (_userId, payload) => {
  const body = payload as ResolveConflictPayload;
  if (!body.conflictId) throw new Error("conflictId is required");

  const conflict = await pmConflictRepo.findById(body.conflictId);
  if (!conflict) throw new Error("Conflict not found");

  await pmConflictRepo.update(conflict.id, {
    resolution: body.resolution,
    resolvedData: body.resolvedData ?? null,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  });

  return { message: "Conflict resolved" };
});

// ── pm.validate_task ──

interface ValidateTaskPayload {
  taskId: string;
}

registerCommand("pm", "validate_task", async (_userId, payload) => {
  const body = payload as ValidateTaskPayload;
  if (!body.taskId) throw new Error("taskId is required");

  const task = await pmTaskRepo.findById(body.taskId);
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

  return result;
});

// ── Sync Logic (same as routes) ──

interface PMProjectLike {
  id: string;
  name: string;
  source: string;
  sourceConfig: unknown;
  lastSyncedAt: string | null;
}

async function performSync(project: PMProjectLike): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    closed: 0,
    unchanged: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    let externalTasks;
    if (project.source === "github") {
      const config = project.sourceConfig as unknown as GitHubSourceConfig;
      externalTasks = await fetchGitHubIssues(config);

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

    const storedTasks = await pmTaskRepo.findByProject(project.id);
    const storedMap = new Map(storedTasks.map((t) => [t.externalId, t]));

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
      })),
    );

    for (const ext of externalTasks) {
      const stored = storedMap.get(ext.externalId);
      const diff = diffs.find((d) => d.taskExternalId === ext.externalId);

      if (!stored) {
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
        const hasLocalChanges = stored.localUpdatedAt && stored.lastSyncedAt &&
          stored.localUpdatedAt > stored.lastSyncedAt;

        if (hasLocalChanges && stored.dirtyFlag === 1) {
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

    // 書き戻し
    const dirtyTasks = await pmTaskRepo.findDirty(project.id);
    if (dirtyTasks.length > 0) {
      const writebackResult = await pushDirtyTasks(
        {
          id: project.id,
          source: project.source,
          sourceConfig: project.sourceConfig as Record<string, string>,
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
        })),
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
