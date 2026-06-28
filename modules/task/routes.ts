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
import { v4 as uuidv4 } from "uuid";
import { taskRepo, taskCategoryRepo, type TaskListFilter } from "../../src/db/repository.js";
import { getTaskPlugins } from "../../src/task-plugins.js";
import type {
  CreateTaskInput,
  TaskPriority,
} from "../../src/shared/types.js";
import { scheduleTaskReminders, cancelTaskReminders } from "../../src/lib/event-reminders.js";
import {
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskPriorityRaised,
} from "../../src/lib/task-notifications.js";
import {
  resolveUserId,
  normalizeStatus,
  normalizeKind,
  normalizeCreatorType,
} from "./personal.js";

export const taskRoutes = new Hono();

const VALID_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

function parseDate(value: string | Date): Date | null {
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
  const status = c.req.query("status");
  const kind = c.req.query("kind");
  const pluginId = c.req.query("pluginId");
  const dueBefore = c.req.query("dueBefore");
  const sort = c.req.query("sort");
  const scope = c.req.query("scope") ?? "owned"; // owned | assigned | group | all

  if (groupId) {
    filter.groupId = groupId;
  } else if (scope === "assigned") {
    filter.assigneeId = userId;
  } else if (scope === "owned") {
    filter.ownerId = userId;
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
  resolveUserId(c);
  const task = await taskRepo.findById(c.req.param("id"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json({ task });
});

// ─── POST /api/tasks ──────────────────────────────────────
taskRoutes.post("/", async (c) => {
  const userId = resolveUserId(c);

  const body = await c.req.json<CreateTaskInput>();
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

  const id = uuidv4();
  await taskRepo.create({
    id,
    ownerId: userId,
    assigneeId: body.assigneeId ?? null,
    groupId: body.groupId ?? null,
    title: body.title,
    description,
    requirements: body.requirements ?? null,
    status,
    kind: normalizeKind(body.kind),
    creatorType: normalizeCreatorType(body.creatorType),
    category,
    priority: body.priority ?? "medium",
    deadline,
    estimatedMinutes: body.estimatedMinutes ?? null,
    pluginId: body.pluginId ?? null,
    pluginRef: body.pluginRef ?? null,
    pluginPayload: body.pluginPayload ?? null,
    completedAt: status === "done" ? new Date() : null,
  });

  // Nuntius へ deadline N 分前通知を予約 (assignee 優先、 fallback owner)
  // 失敗しても task 作成自体は成功扱い (通知は best-effort)
  await scheduleTaskReminders({
    taskId: id,
    userId: body.assigneeId ?? userId,
    title: body.title,
    description: body.description ?? null,
    deadline,
    minutesBefore: body.notifyMinutesBefore,
    notifyMessage: body.notifyMessage,
  }).catch((err) => {
    console.warn(`[task] failed to schedule reminders for ${id}:`, err);
  });

  // 別人にアサインされたら新 assignee へ即時 push
  if (body.assigneeId && body.assigneeId !== userId) {
    await notifyTaskAssigned({
      taskId: id,
      taskTitle: body.title,
      newAssigneeId: body.assigneeId,
      ownerId: userId,
      assignedById: userId,
    }).catch((err) => {
      console.warn(`[task] notifyTaskAssigned failed for ${id}:`, err);
    });
  }

  const created = await taskRepo.findById(id);
  return c.json({ task: created }, 201);
});

// ─── PUT /api/tasks/:id ───────────────────────────────────
taskRoutes.put("/:id", async (c) => {
  const userId = resolveUserId(c);

  const id = c.req.param("id");
  const existing = await taskRepo.findById(id);
  if (!existing) return c.json({ error: "Task not found" }, 404);
  // owner / assignee は更新可能、それ以外は禁止
  if (existing.ownerId !== userId && existing.assigneeId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<Partial<CreateTaskInput>>();
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  // description: description / details(Memoria 互換)
  if (body.description !== undefined) updates.description = body.description;
  else if (body.details !== undefined) updates.description = body.details;
  if (body.requirements !== undefined) updates.requirements = body.requirements;
  if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId;
  if (body.groupId !== undefined) updates.groupId = body.groupId;
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
  if (body.creatorType !== undefined) updates.creatorType = normalizeCreatorType(body.creatorType);
  if (body.estimatedMinutes !== undefined) updates.estimatedMinutes = body.estimatedMinutes;
  if (body.pluginPayload !== undefined) updates.pluginPayload = body.pluginPayload;

  await taskRepo.update(id, updates);
  const updated = await taskRepo.findById(id);

  // 状態変化 push (best-effort)
  // - status: !done → done → owner に完了通知
  // - assigneeId 変更 (別人へ) → 新 assignee に push
  // - priority 上昇 (low/medium → high) → assignee (or owner) に push
  if (updated) {
    const completedNow =
      normalizedStatus === "done" && existing.status !== "done";
    if (completedNow) {
      await notifyTaskCompleted({
        taskId: id,
        taskTitle: updated.title,
        ownerId: updated.ownerId,
        assigneeId: updated.assigneeId,
        completedById: userId,
      }).catch((err) => {
        console.warn(`[task] notifyTaskCompleted failed for ${id}:`, err);
      });
    }

    const newAssignee = updated.assigneeId;
    const oldAssignee = existing.assigneeId;
    if (
      body.assigneeId !== undefined &&
      newAssignee &&
      newAssignee !== oldAssignee
    ) {
      await notifyTaskAssigned({
        taskId: id,
        taskTitle: updated.title,
        newAssigneeId: newAssignee,
        ownerId: updated.ownerId,
        assignedById: userId,
      }).catch((err) => {
        console.warn(`[task] notifyTaskAssigned failed for ${id}:`, err);
      });
    }

    if (
      body.priority !== undefined &&
      updated.priority !== existing.priority
    ) {
      await notifyTaskPriorityRaised({
        taskId: id,
        taskTitle: updated.title,
        ownerId: updated.ownerId,
        assigneeId: updated.assigneeId,
        oldPriority: existing.priority as TaskPriority,
        newPriority: updated.priority as TaskPriority,
        raisedById: userId,
      }).catch((err) => {
        console.warn(`[task] notifyTaskPriorityRaised failed for ${id}:`, err);
      });
    }
  }

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

  await taskRepo.deleteById(id);
  // 予約済みの Nuntius reminders もキャンセル (best-effort)
  await cancelTaskReminders(id).catch(() => {});
  return c.json({ ok: true });
});
