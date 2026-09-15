/**
 * Task Module — Actio コア「タスク (Task)」
 *
 * 解決すべき現在の事象 (ToDo, Issue, レビュー依頼等) を管理する。
 * 要件 (requirements) を持ち、時間拘束はないが期限 (deadline) を
 * 設定できる。
 *
 * 各プラグイン (pm / machina 等) はこの API を経由するか、独自テーブル
 * を保持しつつ pluginId/pluginRef で tasks と紐付ける形で連携する。
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { projectRefRepo, taskRepo, taskCategoryRepo, teamRefRepo, type TaskListFilter } from "../../src/db/repository.js";
import { getUserRole } from "../../src/middleware/getUserId.js";
import { getTaskPlugins } from "../../src/task-plugins.js";
import type {
  CreateTaskInput,
  TaskPriority,
} from "../../src/shared/types.js";
import {
  resolveUserId,
  normalizeStatus,
  normalizeKind,
  normalizeCreatorType,
  toMemoriaShape,
} from "./personal.js";
import { teamTaskRoutes } from "./team-routes.js";
import { readTeamInputMode } from "./team/settings.js";
import { validateLaneTransition, validateTeamTask } from "./validation/team-task.js";
import { readTeamTaskRequestFields, validateTeamTaskMetadata } from "./validation/team-task-request.js";
import { isExecutorType, readExecutorFields, resolveExecutor } from "./validation/executor.js";
import { validateTeamProject } from "./validation/team-project.js";
import { isTaskView, selectCurrentSprintView } from "./views/current-sprint-view.js";
import { CRITICAL_PATH_FIELDS, recomputeCriticalPathSafely } from "./critical-path/recompute.js";
import { taskChangeNotifications } from "./notifications/events.js";
import { enqueueNotificationsSafely } from "./notifications/enqueue.js";
import { toTaskSnapshot } from "./notifications/snapshot.js";
import { notificationAdminRoutes } from "./notifications/admin-routes.js";
import { planningRepositories } from "../../src/db/planning-repository.js";
import { dialect } from "../../src/db/connection.js";

function findProjectRef(code: string) {
  return projectRefRepo.findByCode(code);
}

/** body から creator_type(snake) / creatorType(camel) を取り出す */
function readCreatorType(body: { creatorType?: unknown }): unknown {
  return body.creatorType ?? (body as { creator_type?: unknown }).creator_type;
}

/**
 * body から project_id(snake) / projectId(camel) を取り出す。
 * projectId は nullable (明示的な null = 解除) なので `??` は使わず、
 * どちらのキーが「渡されたか (undefined でないか)」で判定する。
 */
function readProjectId(body: { projectId?: unknown; project_id?: unknown }): unknown {
  if (body.projectId !== undefined) return body.projectId;
  if (body.project_id !== undefined) return body.project_id;
  return undefined;
}

function isAdmin(c: Context): boolean {
  return getUserRole(c) === "admin";
}

async function canAccessTeam(c: Context, teamId: string, userId: string): Promise<boolean> {
  return isAdmin(c) || taskRepo.isTeamMember(teamId, userId);
}

async function canReturnIdempotentTask(
  c: Context,
  task: { ownerId: string; assigneeId: string | null; teamId: string | null },
  userId: string,
): Promise<boolean> {
  if (task.ownerId === userId || task.assigneeId === userId) return true;
  return task.teamId !== null && canAccessTeam(c, task.teamId, userId);
}

async function getTeamInputMode(teamId: string | null): Promise<"minimal" | "full"> {
  if (!teamId) return "minimal";
  const teamRef = await teamRefRepo.findById(teamId);
  return readTeamInputMode(teamRef?.settings);
}

export const taskRoutes = new Hono();
taskRoutes.route("/", teamTaskRoutes);
// /notifications は /:id より前に登録する (Hono は登録順に照合する)。
taskRoutes.route("/", notificationAdminRoutes);

export const VALID_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export function parseDate(value: string | Date): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ─── GET /api/tasks/plugins ───────────────────────────────
taskRoutes.get("/plugins", (c) => {
  return c.json({ plugins: getTaskPlugins() });
});

// ─── GET /api/tasks ───────────────────────────────────────
// 一覧取得 (filter: ownerId / assigneeId / groupId / status / kind / pluginId)
// scope: owned (default) | assigned | group | all
// kind: task / goal / all。 sort=personal で個人タスクボード順 (status→期限→作成)
taskRoutes.get("/", async (c) => {
  const userId = resolveUserId(c);

  const filter: TaskListFilter = {};
  const groupId = c.req.query("groupId");
  const project = c.req.query("project");
  const status = c.req.query("status");
  const kind = c.req.query("kind");
  const pluginId = c.req.query("pluginId");
  const dueBefore = c.req.query("dueBefore");
  const sort = c.req.query("sort");
  const scope = c.req.query("scope") ?? "owned"; // owned | assigned | group | all
  const teamId = c.req.query("team_id");

  if (teamId) {
    if (!await canAccessTeam(c, teamId, userId)) return c.json({ error: "Forbidden" }, 403);
    filter.teamId = teamId;
  } else if (groupId) {
    filter.groupId = groupId;
  } else if (scope === "assigned") {
    filter.assigneeId = userId;
  } else if (scope === "owned") {
    filter.ownerId = userId;
  }
  // project は既存 owned/assigned/group スコープと併用可能な追加フィルタ
  // (EducationLab×Calliope PM 連携。 project_id 指定でプロジェクト単位のタスクを引く)
  if (project) filter.projectId = project;
  const lane = c.req.query("lane");
  const sprintId = c.req.query("sprint_id");
  if (lane && lane !== "daily" && lane !== "backlog") return c.json({ error: "lane must be daily or backlog" }, 400);
  if (lane) filter.lane = lane;
  if (sprintId) filter.sprintId = sprintId;
  const executorType = c.req.query("executor_type");
  if (executorType !== undefined) {
    if (!isExecutorType(executorType)) return c.json({ error: "executor_type must be human or ai" }, 400);
    filter.executorType = executorType;
  }
  const view = c.req.query("view");
  if (view !== undefined) {
    if (!isTaskView(view)) return c.json({ error: "view must be current_sprint" }, 400);
    if (!teamId) return c.json({ error: "view=current_sprint requires team_id" }, 400);
    if (dialect === "mysql") return c.json({ error: "スプリント表示は PostgreSQL または SQLite 配備で利用できます" }, 501);
  }
  if (status) filter.status = normalizeStatus(status) ?? status;
  if (kind) filter.kind = kind; // "task" | "goal" | "all"
  if (pluginId) filter.pluginId = pluginId;
  if (sort === "personal") filter.sort = "personal";
  if (dueBefore) {
    const d = parseDate(dueBefore);
    if (d) filter.dueBefore = d;
  }

  const tasks = await taskRepo.list(filter);
  if (view !== undefined && teamId) {
    const sprints = await planningRepositories().sprints.list(teamId);
    const selected = selectCurrentSprintView(tasks, sprints);
    return c.json({ tasks: selected.tasks, current_sprint: selected.currentSprint });
  }
  // format=memoria: 既存 Memoria 消費者向け互換 shape ({items}, todo/doing/done)
  if (c.req.query("format") === "memoria") {
    return c.json({ items: tasks.map(toMemoriaShape) });
  }
  return c.json({ tasks });
});

// ─── Task Categories (Memoria 個人タスク移植) ───────────────
// 注意: /:id より前に定義する (Hono 静的優先だが明示的に並べる)
taskRoutes.get("/categories", async (c) => {
  const userId = resolveUserId(c);
  const items = await taskCategoryRepo.list(userId);
  return c.json({ items });
});

taskRoutes.post("/categories", async (c) => {
  const userId = resolveUserId(c);
  const body = await c.req.json<{ name?: unknown }>().catch(() => ({ name: undefined }));
  const name = String(body.name ?? "").trim();
  if (!name) return c.json({ error: "name required" }, 400);
  await taskCategoryRepo.register(userId, name);
  return c.json({ items: await taskCategoryRepo.list(userId) }, 201);
});

taskRoutes.delete("/categories/:name", async (c) => {
  const userId = resolveUserId(c);
  const name = decodeURIComponent(c.req.param("name") ?? "");
  await taskCategoryRepo.unregister(userId, name);
  return c.json({ items: await taskCategoryRepo.list(userId) });
});

// ─── GET /api/tasks/:id ───────────────────────────────────
taskRoutes.get("/:id", async (c) => {
  const userId = resolveUserId(c);
  const task = await taskRepo.findById(c.req.param("id"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  if (task.teamId && !await canAccessTeam(c, task.teamId, userId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json({ task });
});

// ─── POST /api/tasks ──────────────────────────────────────
taskRoutes.post("/", async (c) => {
  const userId = resolveUserId(c);

  const body = await c.req.json<CreateTaskInput>();
  const teamFields = readTeamTaskRequestFields(body);
  if (!body.title) {
    return c.json({ error: "title is required" }, 400);
  }
  // status: todo/doing/done エイリアスも受理 (Memoria 互換)
  let status: string = "open";
  if (body.status !== undefined) {
    const normalized = normalizeStatus(body.status);
    if (!normalized) {
      return c.json({ error: "status must be one of open, in_progress, blocked, done, cancelled (todo/doing 可)" }, 400);
    }
    status = normalized;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return c.json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }, 400);
  }

  // deadline: deadline / due_at(Memoria 互換) を受理
  const deadlineInput = body.deadline ?? body.due_at ?? null;
  let deadline: Date | null = null;
  if (deadlineInput) {
    const d = parseDate(deadlineInput);
    if (!d) return c.json({ error: "Invalid deadline" }, 400);
    deadline = d;
  }

  // description: description / details(Memoria 互換) を受理
  const description = body.description ?? body.details ?? null;
  const category = typeof body.category === "string" ? body.category.trim() || null : null;

  const projectIdInput = readProjectId(body);
  const projectId = typeof projectIdInput === "string" ? projectIdInput : null;
  const metadataError = validateTeamTaskMetadata(teamFields);
  if (metadataError) return c.json({ error: metadataError }, 400);
  const teamId = teamFields.teamId ?? null;
  if (teamFields.source === "praeforma-review") return c.json({ error: "Register Pf specifications through the reviewed import API" }, 400);
  if (teamFields.sprintId != null) return c.json({ error: "Assign tasks through the sprint planning API" }, 400);
  if (body.estimatedMinutes != null && (!Number.isSafeInteger(body.estimatedMinutes) || body.estimatedMinutes < 0)) {
    return c.json({ error: "estimatedMinutes must be a non-negative integer" }, 400);
  }
  const executor = resolveExecutor(null, readExecutorFields(body as unknown as Record<string, unknown>));
  if (executor.error) return c.json({ error: executor.error }, 400);
  const projectError = await validateTeamProject(teamId, projectId, findProjectRef);
  if (projectError) return c.json({ error: projectError }, 400);
  const inputMode = await getTeamInputMode(teamId);
  const teamValidation = await validateTeamTask({
    teamId, assigneeId: body.assigneeId ?? null, lane: teamFields.lane,
    sprintId: teamFields.sprintId ?? null, deadline, durationDays: teamFields.durationDays ?? null, blockedBy: teamFields.blockedBy,
  }, inputMode, { isMember: (candidateTeamId, memberId) => taskRepo.isTeamMember(candidateTeamId, memberId), isTaskInTeam: async (candidateTeamId, taskId) => (await taskRepo.findById(taskId))?.teamId === candidateTeamId });
  if (teamValidation.error) return c.json({ error: teamValidation.error }, 400);
  if (teamValidation.value.teamId && !await canAccessTeam(c, teamValidation.value.teamId, userId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (teamFields.source && teamFields.sourceRef) {
    const duplicate = await taskRepo.findBySource(teamFields.source, teamFields.sourceRef);
    if (duplicate) {
      if (!await canReturnIdempotentTask(c, duplicate, userId)) {
        return c.json({ error: "source/source_ref already exists" }, 409);
      }
      return c.json({ task: duplicate }, 200);
    }
  }

  const id = uuidv4();
  const newTask: Parameters<typeof taskRepo.create>[0] = {
    id,
    ownerId: userId,
    assigneeId: body.assigneeId ?? null,
    groupId: body.groupId ?? null,
    projectId,
    teamId,
    lane: teamValidation.value.lane,
    sprintId: teamFields.sprintId ?? null,
    durationDays: teamFields.durationDays ?? null,
    source: teamFields.source ?? null,
    sourceRef: teamFields.sourceRef ?? null,
    blockedBy: teamFields.blockedBy ?? [],
    storyPoints: teamFields.storyPoints ?? null,
    title: body.title,
    description,
    requirements: body.requirements ?? null,
    status,
    kind: normalizeKind(body.kind),
    creatorType: normalizeCreatorType(readCreatorType(body)),
    executorType: executor.value.executorType,
    aiExecutor: executor.value.aiExecutor,
    category,
    priority: body.priority ?? "medium",
    deadline,
    estimatedMinutes: body.estimatedMinutes ?? null,
    pluginId: body.pluginId ?? null,
    pluginRef: body.pluginRef ?? null,
    pluginPayload: body.pluginPayload ?? null,
    completedAt: status === "done" ? new Date() : null,
  };
  try {
    await taskRepo.create(newTask);
  } catch (error) {
    // The unique index is the final arbiter when two retries race between lookup and insert.
    if (!teamFields.source || !teamFields.sourceRef) throw error;
    const racedDuplicate = await taskRepo.findBySource(teamFields.source, teamFields.sourceRef);
    if (!racedDuplicate) throw error;
    if (!await canReturnIdempotentTask(c, racedDuplicate, userId)) {
      return c.json({ error: "source/source_ref already exists" }, 409);
    }
    return c.json({ task: racedDuplicate }, 200);
  }

  await recomputeCriticalPathSafely([teamId]);
  const created = await taskRepo.findById(id);
  if (created) await enqueueNotificationsSafely(taskChangeNotifications(null, toTaskSnapshot(created)));
  return c.json({ task: created }, 201);
});

// ─── PUT / PATCH /api/tasks/:id ───────────────────────────
// PATCH は Memoria 互換 (既存 skill が PATCH {status} を投げる)
taskRoutes.on(["PUT", "PATCH"], "/:id", async (c) => {
  const userId = resolveUserId(c);

  const id = c.req.param("id");
  const existing = await taskRepo.findById(id);
  if (!existing) return c.json({ error: "Task not found" }, 404);
  // owner / assignee は更新可能、それ以外は禁止
  const hasAdminTeamAccess = existing.teamId !== null && isAdmin(c);
  if (existing.ownerId !== userId && existing.assigneeId !== userId && !hasAdminTeamAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<Partial<CreateTaskInput>>();
  const teamFields = readTeamTaskRequestFields(body);
  if (teamFields.sprintId !== undefined && teamFields.sprintId !== existing.sprintId) {
    return c.json({ error: "Change sprint membership through the sprint planning API" }, 400);
  }
  if (existing.sprintId && ((teamFields.teamId !== undefined && teamFields.teamId !== existing.teamId)
    || (teamFields.lane !== undefined && teamFields.lane !== existing.lane))) {
    return c.json({ error: "Remove the task from its sprint before changing team or lane" }, 409);
  }
  if (existing.source === "praeforma-review" && (teamFields.source !== undefined || teamFields.sourceRef !== undefined || body.pluginPayload !== undefined)) {
    return c.json({ error: "Pf review provenance is immutable" }, 400);
  }
  if (teamFields.source === "praeforma-review" && existing.source !== "praeforma-review") {
    return c.json({ error: "Register Pf specifications through the reviewed import API" }, 400);
  }
  if (body.estimatedMinutes != null && (!Number.isSafeInteger(body.estimatedMinutes) || body.estimatedMinutes < 0)) {
    return c.json({ error: "estimatedMinutes must be a non-negative integer" }, 400);
  }
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  // description: description / details(Memoria 互換)
  if (body.description !== undefined) updates.description = body.description;
  else if (body.details !== undefined) updates.description = body.details;
  if (body.requirements !== undefined) updates.requirements = body.requirements;
  if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId;
  if (body.groupId !== undefined) updates.groupId = body.groupId;
  const projectIdInput = readProjectId(body);
  if (projectIdInput !== undefined) {
    updates.projectId = typeof projectIdInput === "string" ? projectIdInput : null;
  }
  if (body.kind !== undefined) updates.kind = normalizeKind(body.kind);
  if (body.category !== undefined) {
    updates.category =
      typeof body.category === "string" ? body.category.trim() || null : null;
  }
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return c.json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }, 400);
    }
    updates.priority = body.priority;
  }
  // status: todo/doing/done エイリアスも受理
  const normalizedStatus =
    body.status !== undefined ? normalizeStatus(body.status) : undefined;
  if (body.status !== undefined) {
    if (!normalizedStatus) {
      return c.json({ error: "status must be one of open, in_progress, blocked, done, cancelled (todo/doing 可)" }, 400);
    }
    updates.status = normalizedStatus;
    if (normalizedStatus === "done" && !existing.completedAt) {
      updates.completedAt = new Date();
    } else if (normalizedStatus !== "done" && existing.completedAt) {
      updates.completedAt = null;
    }
  }
  // deadline: deadline / due_at(Memoria 互換)
  const deadlineInput =
    body.deadline !== undefined ? body.deadline : body.due_at;
  if (deadlineInput !== undefined) {
    if (deadlineInput === null) {
      updates.deadline = null;
    } else {
      const d = parseDate(deadlineInput);
      if (!d) return c.json({ error: "Invalid deadline" }, 400);
      updates.deadline = d;
    }
    // Memoria 挙動: AI 作成タスクをユーザが期日変更したら human 化 (採用扱い)
    const newDeadlineMs = updates.deadline instanceof Date ? updates.deadline.getTime() : null;
    const oldDeadlineMs = existing.deadline ? existing.deadline.getTime() : null;
    if (existing.creatorType === "ai" && newDeadlineMs !== oldDeadlineMs) {
      updates.creatorType = "human";
    }
  }
  const creatorTypeInput = readCreatorType(body);
  if (creatorTypeInput !== undefined) updates.creatorType = normalizeCreatorType(creatorTypeInput);
  const executor = resolveExecutor(
    { executorType: isExecutorType(existing.executorType) ? existing.executorType : "human", aiExecutor: existing.aiExecutor },
    readExecutorFields(body as unknown as Record<string, unknown>),
  );
  if (executor.error) return c.json({ error: executor.error }, 400);
  if (executor.value.executorType !== existing.executorType) updates.executorType = executor.value.executorType;
  if (executor.value.aiExecutor !== existing.aiExecutor) updates.aiExecutor = executor.value.aiExecutor;
  if (body.estimatedMinutes !== undefined) updates.estimatedMinutes = body.estimatedMinutes;
  const nextTeamFields = {
    ...teamFields,
    source: teamFields.source !== undefined ? teamFields.source : existing.source,
    sourceRef: teamFields.sourceRef !== undefined ? teamFields.sourceRef : existing.sourceRef,
  };
  const metadataError = validateTeamTaskMetadata(nextTeamFields);
  if (metadataError) return c.json({ error: metadataError }, 400);
  if (teamFields.source !== undefined || teamFields.sourceRef !== undefined) {
    const source = nextTeamFields.source;
    const sourceRef = nextTeamFields.sourceRef;
    if (source && sourceRef) {
      const duplicate = await taskRepo.findBySource(source, sourceRef);
      if (duplicate && duplicate.id !== id) return c.json({ error: "source/source_ref already exists" }, 409);
    }
  }
  const nextTeamId = teamFields.teamId !== undefined ? teamFields.teamId ?? null : existing.teamId;
  const nextLane = teamFields.lane !== undefined
    ? teamFields.lane
    : teamFields.durationDays !== undefined && existing.lane === "daily"
      ? undefined
      : existing.lane as "daily" | "backlog";
  let nextDeadline = deadlineInput !== undefined ? updates.deadline as Date | null : existing.deadline;
  if (teamFields.lane !== undefined && teamFields.lane !== existing.lane) {
    const transition = validateLaneTransition(existing, {
      lane: teamFields.lane,
      deadline: deadlineInput !== undefined ? updates.deadline as Date | null : undefined,
      durationDays: teamFields.durationDays !== undefined ? teamFields.durationDays : existing.durationDays,
    });
    if (transition.error) return c.json({ error: transition.error }, 400);
    nextDeadline = transition.deadline ?? null;
    updates.deadline = nextDeadline;
  }
  const inputMode = await getTeamInputMode(nextTeamId);
  const teamValidation = await validateTeamTask({
    id,
    teamId: nextTeamId,
    assigneeId: body.assigneeId !== undefined ? body.assigneeId ?? null : existing.assigneeId,
    lane: nextLane,
    sprintId: teamFields.sprintId !== undefined ? teamFields.sprintId ?? null : existing.sprintId,
    deadline: nextDeadline,
    durationDays: teamFields.durationDays !== undefined ? teamFields.durationDays : existing.durationDays,
    blockedBy: teamFields.blockedBy !== undefined ? teamFields.blockedBy : existing.blockedBy,
  }, inputMode, {
    isMember: (candidateTeamId, memberId) => taskRepo.isTeamMember(candidateTeamId, memberId),
    isTaskInTeam: async (candidateTeamId, taskId) => (await taskRepo.findById(taskId))?.teamId === candidateTeamId,
  });
  if (teamValidation.error) return c.json({ error: teamValidation.error }, 400);
  if (teamValidation.value.teamId && !await canAccessTeam(c, teamValidation.value.teamId, userId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  // 既存の不透明 project_id を壊さないよう、 チームかプロジェクトを変えたときだけ Cc の所属を検証する。
  if (projectIdInput !== undefined || teamFields.teamId !== undefined) {
    const nextProjectId = projectIdInput !== undefined
      ? (typeof projectIdInput === "string" ? projectIdInput : null)
      : existing.projectId;
    const projectError = await validateTeamProject(nextTeamId, nextProjectId, findProjectRef);
    if (projectError) return c.json({ error: projectError }, 400);
  }
  if (teamFields.teamId !== undefined) updates.teamId = teamFields.teamId;
  if (teamFields.lane !== undefined || teamFields.durationDays !== undefined) updates.lane = teamValidation.value.lane;
  if (teamFields.sprintId !== undefined) updates.sprintId = teamFields.sprintId;
  if (teamFields.durationDays !== undefined) updates.durationDays = teamFields.durationDays;
  if (teamFields.source !== undefined) updates.source = teamFields.source;
  if (teamFields.sourceRef !== undefined) updates.sourceRef = teamFields.sourceRef;
  if (teamFields.blockedBy !== undefined) updates.blockedBy = teamFields.blockedBy;
  if (teamFields.storyPoints !== undefined) updates.storyPoints = teamFields.storyPoints;
  if (body.pluginPayload !== undefined) updates.pluginPayload = body.pluginPayload;

  await taskRepo.update(id, updates);
  if (CRITICAL_PATH_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(updates, field))) {
    await recomputeCriticalPathSafely([existing.teamId, updates.teamId as string | null | undefined]);
  }
  const updated = await taskRepo.findById(id);
  if (updated) await enqueueNotificationsSafely(taskChangeNotifications(toTaskSnapshot(existing), toTaskSnapshot(updated)));
  return c.json({ task: updated });
});

// ─── DELETE /api/tasks/:id ────────────────────────────────
taskRoutes.delete("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const existing = await taskRepo.findById(id);
  if (!existing) return c.json({ error: "Task not found" }, 404);
  if (existing.ownerId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (existing.sprintId) return c.json({ error: "Remove the task from its sprint before deleting it" }, 409);

  await taskRepo.deleteById(id);
  await recomputeCriticalPathSafely([existing.teamId]);
  return c.json({ ok: true });
});
