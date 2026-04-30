/**
 * Event Module — Actio コア「予定 (Event)」
 *
 * 時間拘束のある未来の事象 (MTG, 講義, 予約等) を管理する。
 * 要件は持たず、startTime / endTime で時間枠を確定的に保持する。
 *
 * 各プラグイン (calendar / voting / facility-booking 等) はこの API を
 * 経由するか、独自テーブルを保持しつつ pluginId/pluginRef で events と
 * 紐付ける形で連携する。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { eventRepo, type EventListFilter } from "../../src/db/repository.js";
import { getEventPlugins } from "../../src/event-plugins.js";
import type { CreateEventInput, EventVisibility } from "../../src/shared/types.js";
import { scheduleEventReminders, cancelEventReminders } from "../../src/lib/event-reminders.js";

export const eventRoutes = new Hono();

// ─── Helper: parse ISO date safely ────────────────────────
function parseDate(value: string | Date): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ─── GET /api/events/plugins ──────────────────────────────
// 登録済み Event プラグイン一覧
eventRoutes.get("/plugins", (c) => {
  return c.json({ plugins: getEventPlugins() });
});

// ─── GET /api/events ──────────────────────────────────────
// 一覧取得 (filter: ownerId / groupId / from / to / pluginId)
// 認証ユーザの予定 (ownerId = userId) または groupId 指定でグループ予定
eventRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const filter: EventListFilter = {};
  const groupId = c.req.query("groupId");
  const pluginId = c.req.query("pluginId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const scope = c.req.query("scope") ?? "owned"; // owned | group | all

  if (groupId) {
    filter.groupId = groupId;
  } else if (scope === "owned") {
    filter.ownerId = userId;
  }
  if (pluginId) filter.pluginId = pluginId;
  if (from) {
    const d = parseDate(from);
    if (d) filter.from = d;
  }
  if (to) {
    const d = parseDate(to);
    if (d) filter.to = d;
  }

  const events = await eventRepo.list(filter);
  return c.json({ events });
});

// ─── GET /api/events/:id ──────────────────────────────────
eventRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const event = await eventRepo.findById(c.req.param("id"));
  if (!event) return c.json({ error: "Event not found" }, 404);
  return c.json({ event });
});

// ─── POST /api/events ─────────────────────────────────────
// 作成 (managed=core プラグイン or 素の予定)
eventRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<CreateEventInput>();
  if (!body.title || !body.startTime || !body.endTime) {
    return c.json({ error: "title, startTime, endTime are required" }, 400);
  }
  const start = parseDate(body.startTime);
  const end = parseDate(body.endTime);
  if (!start || !end) return c.json({ error: "Invalid startTime or endTime" }, 400);
  if (end <= start) return c.json({ error: "endTime must be after startTime" }, 400);

  const id = uuidv4();
  await eventRepo.create({
    id,
    ownerId: userId,
    groupId: body.groupId ?? null,
    title: body.title,
    description: body.description ?? null,
    startTime: start,
    endTime: end,
    isAllDay: body.isAllDay ?? false,
    location: body.location ?? null,
    visibility: (body.visibility ?? "private") as EventVisibility,
    pluginId: body.pluginId ?? null,
    pluginRef: body.pluginRef ?? null,
    pluginPayload: body.pluginPayload ?? null,
  });

  // Nuntius へ事前通知を予約 (notifyMinutesBefore が指定されていれば)
  // 失敗しても event 作成自体は成功扱い (通知は best-effort)
  await scheduleEventReminders({
    eventId: id,
    userId,
    title: body.title,
    description: body.description ?? null,
    startTime: start,
    minutesBefore: body.notifyMinutesBefore,
    notifyMessage: body.notifyMessage,
  }).catch((err) => {
    console.warn(`[event] failed to schedule reminders for ${id}:`, err);
  });

  const created = await eventRepo.findById(id);
  return c.json({ event: created }, 201);
});

// ─── PUT /api/events/:id ──────────────────────────────────
eventRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const existing = await eventRepo.findById(id);
  if (!existing) return c.json({ error: "Event not found" }, 404);
  if (existing.ownerId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<Partial<CreateEventInput>>();
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.startTime !== undefined) {
    const d = parseDate(body.startTime);
    if (!d) return c.json({ error: "Invalid startTime" }, 400);
    updates.startTime = d;
  }
  if (body.endTime !== undefined) {
    const d = parseDate(body.endTime);
    if (!d) return c.json({ error: "Invalid endTime" }, 400);
    updates.endTime = d;
  }
  if (body.isAllDay !== undefined) updates.isAllDay = body.isAllDay;
  if (body.location !== undefined) updates.location = body.location;
  if (body.visibility !== undefined) updates.visibility = body.visibility;
  if (body.groupId !== undefined) updates.groupId = body.groupId;
  if (body.pluginPayload !== undefined) updates.pluginPayload = body.pluginPayload;

  await eventRepo.update(id, updates);
  const updated = await eventRepo.findById(id);
  return c.json({ event: updated });
});

// ─── DELETE /api/events/:id ───────────────────────────────
eventRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const existing = await eventRepo.findById(id);
  if (!existing) return c.json({ error: "Event not found" }, 404);
  if (existing.ownerId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await eventRepo.deleteById(id);
  // 予約済みの Nuntius reminders もキャンセル
  await cancelEventReminders(id).catch(() => {});
  return c.json({ ok: true });
});
