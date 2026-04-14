/**
 * Task Module — Schedula コア「タスク (Task)」
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
import { getUserId } from "../../src/middleware/getUserId.js";
import { taskRepo, type TaskListFilter } from "../../src/db/repository.js";
import { getTaskPlugins } from "../../src/task-plugins.js";
import type {
  CreateTaskInput,
  TaskPriority,
  TaskStatus,
} from "../../src/shared/types.js";

export const taskRoutes = new Hono();

const VALID_STATUSES: TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];
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
// 一覧取得 (filter: ownerId / assigneeId / groupId / status / pluginId)
// scope: owned (default) | assigned | group | all
taskRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const filter: TaskListFilter = {};
  const groupId = c.req.query("groupId");
  const status = c.req.query("status");
  const pluginId = c.req.query("pluginId");
  const dueBefore = c.req.query("dueBefore");
  const scope = c.req.query("scope") ?? "owned"; // owned | assigned | group | all

  if (groupId) {
    filter.groupId = groupId;
  } else if (scope === "assigned") {
    filter.assigneeId = userId;
  } else if (scope === "owned") {
    filter.ownerId = userId;
  }
  if (status) filter.status = status;
  if (pluginId) filter.pluginId = pluginId;
  if (dueBefore) {
    const d = parseDate(dueBefore);
    if (d) filter.dueBefore = d;
  }

  const tasks = await taskRepo.list(filter);
  return c.json({ tasks });
});

// ─── GET /api/tasks/:id ───────────────────────────────────
taskRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const task = await taskRepo.findById(c.req.param("id"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json({ task });
});

// ─── POST /api/tasks ──────────────────────────────────────
taskRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<CreateTaskInput>();
  if (!body.title) {
    return c.json({ error: "title is required" }, 400);
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return c.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, 400);
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return c.json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }, 400);
  }

  let deadline: Date | null = null;
  if (body.deadline) {
    const d = parseDate(body.deadline);
    if (!d) return c.json({ error: "Invalid deadline" }, 400);
    deadline = d;
  }

  const id = uuidv4();
  await taskRepo.create({
    id,
    ownerId: userId,
    assigneeId: body.assigneeId ?? null,
    groupId: body.groupId ?? null,
    title: body.title,
    description: body.description ?? null,
    requirements: body.requirements ?? null,
    status: body.status ?? "open",
    priority: body.priority ?? "medium",
    deadline,
    estimatedMinutes: body.estimatedMinutes ?? null,
    pluginId: body.pluginId ?? null,
    pluginRef: body.pluginRef ?? null,
    pluginPayload: body.pluginPayload ?? null,
    completedAt: null,
  });

  const created = await taskRepo.findById(id);
  return c.json({ task: created }, 201);
});

// ─── PUT /api/tasks/:id ───────────────────────────────────
taskRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

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
  if (body.description !== undefined) updates.description = body.description;
  if (body.requirements !== undefined) updates.requirements = body.requirements;
  if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId;
  if (body.groupId !== undefined) updates.groupId = body.groupId;
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return c.json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }, 400);
    }
    updates.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return c.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, 400);
    }
    updates.status = body.status;
    if (body.status === "done" && !existing.completedAt) {
      updates.completedAt = new Date();
    } else if (body.status !== "done" && existing.completedAt) {
      updates.completedAt = null;
    }
  }
  if (body.deadline !== undefined) {
    if (body.deadline === null) {
      updates.deadline = null;
    } else {
      const d = parseDate(body.deadline);
      if (!d) return c.json({ error: "Invalid deadline" }, 400);
      updates.deadline = d;
    }
  }
  if (body.estimatedMinutes !== undefined) updates.estimatedMinutes = body.estimatedMinutes;
  if (body.pluginPayload !== undefined) updates.pluginPayload = body.pluginPayload;

  await taskRepo.update(id, updates);
  const updated = await taskRepo.findById(id);
  return c.json({ task: updated });
});

// ─── DELETE /api/tasks/:id ────────────────────────────────
taskRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const existing = await taskRepo.findById(id);
  if (!existing) return c.json({ error: "Task not found" }, 404);
  if (existing.ownerId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await taskRepo.deleteById(id);
  return c.json({ ok: true });
});
