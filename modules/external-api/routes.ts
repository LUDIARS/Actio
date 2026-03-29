/**
 * 外部API ルート
 *
 * APIキー (X-API-Client-ID / X-API-Client-Secret) で認証される外部向けAPI。
 * カレンダー・リマインダー・予定設定 の3モジュールを公開。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { requireApiKey } from "./middleware.js";
import { keyManagement } from "./key-management.js";
import { getUserId } from "../../src/middleware/getUserId.js";
import {
  personalEventRepo,
  planRepo,
  myPlanRepo,
  notificationPreferenceRepo,
  notificationRepo,
  webhookEndpointRepo,
  reminderRepo,
} from "../../src/db/repository.js";
import { randomUUID } from "crypto";
import { apiDocumentation } from "./docs.js";

const externalApi = new Hono();

// ─── API Key Management (JWT認証、内部用) ─────────────────────
externalApi.route("/clients", keyManagement);

// ─── API Documentation ───────────────────────────────────────
externalApi.get("/docs", (c) => {
  return c.json(apiDocumentation);
});

// ═══════════════════════════════════════════════════════════════
// 外部API: カレンダー (APIキー認証)
// ═══════════════════════════════════════════════════════════════

const calendarApi = new Hono();
calendarApi.use("*", requireApiKey("calendar"));

// ─── GET /events - 手動予定一覧 ──────────────────────────────

calendarApi.get("/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const events = await personalEventRepo.findByUserId(userId);
  return c.json({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      day: e.day,
      period: e.period,
      duration: e.duration,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType,
      isPrivate: e.isPrivate,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    })),
  });
});

// ─── GET /events/:id - 予定詳細 ──────────────────────────────

calendarApi.get("/events/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("id");
  const event = await personalEventRepo.findByIdAndUserId(eventId, userId);

  if (!event) return c.json({ error: "Event not found" }, 404);

  return c.json({ event });
});

// ─── POST /events - 予定作成 ─────────────────────────────────

calendarApi.post("/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    title: string;
    description?: string;
    day: number;
    period: number;
    duration?: number;
    startTime?: string;
    endTime?: string;
    eventType?: string;
    isPrivate?: boolean;
  }>();

  if (!body.title || body.day == null || body.period == null) {
    return c.json({ error: "title, day, period are required" }, 400);
  }
  if (body.day < 0 || body.day > 6) return c.json({ error: "day must be 0-6" }, 400);
  if (body.period < 0 || body.period > 10) return c.json({ error: "period must be 0-10" }, 400);

  const existing = await personalEventRepo.findByUserDayPeriod(userId, body.day, body.period);
  if (existing) return c.json({ error: "Slot already occupied" }, 409);

  const id = uuidv4();
  const now = new Date();

  await personalEventRepo.create({
    id,
    userId,
    title: body.title,
    description: body.description || null,
    day: body.day,
    period: body.period,
    duration: body.duration || 1,
    startTime: body.startTime || null,
    endTime: body.endTime || null,
    eventType: body.eventType || "personal",
    isPrivate: body.isPrivate !== false,
    createdAt: now,
    updatedAt: now,
  });

  const created = await personalEventRepo.findById(id);
  return c.json({ event: created }, 201);
});

// ─── PUT /events/:id - 予定更新 ─────────────────────────────

calendarApi.put("/events/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("id");
  const existing = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!existing) return c.json({ error: "Event not found" }, 404);

  const body = await c.req.json<{
    title?: string;
    description?: string;
    day?: number;
    period?: number;
    duration?: number;
    startTime?: string;
    endTime?: string;
    eventType?: string;
    isPrivate?: boolean;
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.day !== undefined) updates.day = body.day;
  if (body.period !== undefined) updates.period = body.period;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.startTime !== undefined) updates.startTime = body.startTime;
  if (body.endTime !== undefined) updates.endTime = body.endTime;
  if (body.eventType !== undefined) updates.eventType = body.eventType;
  if (body.isPrivate !== undefined) updates.isPrivate = body.isPrivate;

  await personalEventRepo.update(eventId, updates);
  const updated = await personalEventRepo.findById(eventId);

  return c.json({ event: updated });
});

// ─── DELETE /events/:id - 予定削除 ────────────────────────────

calendarApi.delete("/events/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("id");
  const existing = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!existing) return c.json({ error: "Event not found" }, 404);

  await personalEventRepo.deleteById(eventId);
  return c.json({ message: "Event deleted" });
});

// ═══════════════════════════════════════════════════════════════
// 外部API: リマインダー (通知設定) (APIキー認証)
// ═══════════════════════════════════════════════════════════════

const remindersApi = new Hono();
remindersApi.use("*", requireApiKey("reminders"));

// ─── GET /preferences - 通知設定取得 ─────────────────────────

remindersApi.get("/preferences", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const prefs = await notificationPreferenceRepo.findByUserId(userId);

  return c.json({
    preferences: prefs.map((p) => ({
      id: p.id,
      channel: p.channel,
      enabledEvents: p.enabledEvents,
      reminder: {
        dayBefore: p.reminderDayBefore,
        dayBeforeTime: p.reminderDayBeforeTime,
        morningOf: p.reminderMorningOf,
        morningOfTime: p.reminderMorningOfTime,
        before: p.reminderBefore,
        beforeMinutes: p.reminderBeforeMinutes,
      },
      quietHoursStart: p.quietHoursStart,
      quietHoursEnd: p.quietHoursEnd,
    })),
  });
});

// ─── PUT /preferences - 通知設定更新 ─────────────────────────

remindersApi.put("/preferences", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    channel: string;
    enabledEvents?: string[];
    reminder?: {
      dayBefore?: boolean;
      dayBeforeTime?: string;
      morningOf?: boolean;
      morningOfTime?: string;
      before?: boolean;
      beforeMinutes?: number;
    };
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }>();

  if (!body.channel) return c.json({ error: "channel is required" }, 400);

  const existing = await notificationPreferenceRepo.findByUserAndChannel(userId, body.channel);

  if (existing) {
    const updated = await notificationPreferenceRepo.update(existing.id, {
      enabledEvents: body.enabledEvents ?? existing.enabledEvents,
      reminderDayBefore: body.reminder?.dayBefore ?? existing.reminderDayBefore,
      reminderDayBeforeTime: body.reminder?.dayBeforeTime ?? existing.reminderDayBeforeTime,
      reminderMorningOf: body.reminder?.morningOf ?? existing.reminderMorningOf,
      reminderMorningOfTime: body.reminder?.morningOfTime ?? existing.reminderMorningOfTime,
      reminderBefore: body.reminder?.before ?? existing.reminderBefore,
      reminderBeforeMinutes: body.reminder?.beforeMinutes ?? existing.reminderBeforeMinutes,
      quietHoursStart: body.quietHoursStart ?? existing.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd ?? existing.quietHoursEnd,
    });
    return c.json({ preference: updated });
  } else {
    const created = await notificationPreferenceRepo.create({
      id: uuidv4(),
      userId,
      channel: body.channel,
      enabledEvents: body.enabledEvents || [],
      reminderDayBefore: body.reminder?.dayBefore ?? true,
      reminderDayBeforeTime: body.reminder?.dayBeforeTime ?? "18:00",
      reminderMorningOf: body.reminder?.morningOf ?? true,
      reminderMorningOfTime: body.reminder?.morningOfTime ?? "08:00",
      reminderBefore: body.reminder?.before ?? true,
      reminderBeforeMinutes: body.reminder?.beforeMinutes ?? 15,
      quietHoursStart: body.quietHoursStart ?? "22:00",
      quietHoursEnd: body.quietHoursEnd ?? "07:00",
    });
    return c.json({ preference: created }, 201);
  }
});

// ─── GET /notifications - 通知履歴取得 ───────────────────────

remindersApi.get("/notifications", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const notifications = await notificationRepo.findByUserId(userId);
  return c.json({ notifications });
});

// ─── POST /notifications/:id/read - 既読にする ──────────────

remindersApi.post("/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  const updated = await notificationRepo.markAsRead(id);
  if (!updated) return c.json({ error: "Notification not found" }, 404);
  return c.json({ message: "Marked as read" });
});

// ─── GET /webhooks - Webhook一覧 ────────────────────────────

remindersApi.get("/webhooks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const webhooks = await webhookEndpointRepo.findByCreatedBy(userId);
  return c.json({
    webhooks: webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      failCount: w.failCount,
      lastDeliveredAt: w.lastDeliveredAt,
      createdAt: w.createdAt,
    })),
  });
});

// ─── GET /reminders - リマインダー一覧 ──────────────────────────

remindersApi.get("/reminders", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const status = c.req.query("status");
  let items;
  if (status === "pending") {
    items = await reminderRepo.findPending(userId);
  } else {
    items = await reminderRepo.findByUserId(userId);
  }
  return c.json({ reminders: items });
});

// ─── POST /reminders - リマインダー作成 ─────────────────────────

remindersApi.post("/reminders", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    title: string;
    description?: string;
    remindAt: string;
    repeatRule?: string;
  }>();

  if (!body.title || !body.remindAt) {
    return c.json({ error: "title and remindAt are required" }, 400);
  }

  const remindDate = new Date(body.remindAt);
  if (isNaN(remindDate.getTime())) {
    return c.json({ error: "remindAt is not a valid date" }, 400);
  }

  const validRules = ["none", "daily", "weekly", "monthly", "yearly"];
  const repeatRule = body.repeatRule || "none";
  if (!validRules.includes(repeatRule)) {
    return c.json({ error: `repeatRule must be one of: ${validRules.join(", ")}` }, 400);
  }

  const reminder = await reminderRepo.create({
    id: randomUUID(),
    userId,
    title: body.title,
    description: body.description || null,
    remindAt: remindDate.toISOString(),
    repeatRule,
    status: "pending",
    source: "api",
  });

  return c.json({ reminder }, 201);
});

// ─── PUT /reminders/:id - リマインダー更新 ──────────────────────

remindersApi.put("/reminders/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const existing = await reminderRepo.findById(id);
  if (!existing) return c.json({ error: "Reminder not found" }, 404);
  if (existing.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json<{
    title?: string;
    description?: string;
    remindAt?: string;
    repeatRule?: string;
    status?: string;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.remindAt !== undefined) {
    const d = new Date(body.remindAt);
    if (isNaN(d.getTime())) return c.json({ error: "remindAt is not valid" }, 400);
    updates.remindAt = d.toISOString();
  }
  if (body.repeatRule !== undefined) updates.repeatRule = body.repeatRule;
  if (body.status !== undefined) {
    const valid = ["pending", "done", "cancelled"];
    if (!valid.includes(body.status)) return c.json({ error: `status must be: ${valid.join(", ")}` }, 400);
    updates.status = body.status;
  }

  const updated = await reminderRepo.update(id, updates);
  return c.json({ reminder: updated });
});

// ─── DELETE /reminders/:id - リマインダー削除 ───────────────────

remindersApi.delete("/reminders/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const existing = await reminderRepo.findById(id);
  if (!existing) return c.json({ error: "Reminder not found" }, 404);
  if (existing.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  await reminderRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ─── PATCH /reminders/:id/done - リマインダー完了 ───────────────

remindersApi.patch("/reminders/:id/done", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const existing = await reminderRepo.findById(id);
  if (!existing) return c.json({ error: "Reminder not found" }, 404);
  if (existing.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  const updated = await reminderRepo.update(id, { status: "done" });
  return c.json({ reminder: updated });
});

// ═══════════════════════════════════════════════════════════════
// 外部API: 予定設定 (マイプラン・プラン) (APIキー認証)
// ═══════════════════════════════════════════════════════════════

const schedulesApi = new Hono();
schedulesApi.use("*", requireApiKey("schedules"));

// ─── GET /plans - プラン一覧 ─────────────────────────────────

schedulesApi.get("/plans", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const plans = await planRepo.findByUserId(userId);
  return c.json({ plans });
});

// ─── POST /plans - プラン作成 ────────────────────────────────

schedulesApi.post("/plans", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    name: string;
    description?: string;
    days: number[];
    startPeriod: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }>();

  if (!body.name || !body.days?.length || body.startPeriod == null) {
    return c.json({ error: "name, days, startPeriod are required" }, 400);
  }

  for (const d of body.days) {
    if (d < 0 || d > 6) return c.json({ error: "days must contain values 0-6" }, 400);
  }
  if (body.startPeriod < 0 || body.startPeriod > 10) {
    return c.json({ error: "startPeriod must be 0-10" }, 400);
  }

  const planId = uuidv4();
  const now = new Date();

  await planRepo.create({
    id: planId,
    userId,
    name: body.name,
    description: body.description || null,
    days: body.days,
    startPeriod: body.startPeriod,
    duration: body.duration || 1,
    eventType: body.eventType || "personal",
    isPrivate: body.isPrivate !== false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const plan = await planRepo.findById(planId);
  return c.json({ plan }, 201);
});

// ─── DELETE /plans/:id - プラン削除 ──────────────────────────

schedulesApi.delete("/plans/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = await planRepo.findByIdAndUserId(planId, userId);
  if (!existing) return c.json({ error: "Plan not found" }, 404);

  await personalEventRepo.deleteByUserAndPlan(userId, planId);
  await planRepo.deleteById(planId);

  return c.json({ message: "Plan and associated events deleted" });
});

// ─── GET /myplans - マイプラン一覧 ──────────────────────────

schedulesApi.get("/myplans", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const plans = await myPlanRepo.findByUserId(userId);

  plans.sort((a, b) => {
    if (a.patternType !== b.patternType) {
      return a.patternType === "special" ? -1 : 1;
    }
    return b.priority - a.priority;
  });

  return c.json({ plans });
});

// ─── POST /myplans - マイプラン作成 ─────────────────────────

schedulesApi.post("/myplans", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  interface WeeklySlot {
    startTime: string;
    endTime: string;
    title: string;
    period?: number;
    duration?: number;
  }

  const body = await c.req.json<{
    name: string;
    patternType?: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule?: Record<string, WeeklySlot[]>;
    groupId?: string;
  }>();

  if (!body.name) return c.json({ error: "name is required" }, 400);

  const planId = uuidv4();
  const now = new Date();
  const patternType = body.patternType || "basic";
  const priority = patternType === "special" ? 10 : 0;

  await myPlanRepo.create({
    id: planId,
    userId,
    groupId: body.groupId || null,
    name: body.name,
    patternType,
    validFrom: body.validFrom || null,
    validUntil: body.validUntil || null,
    weeklySchedule: body.weeklySchedule || {},
    isActive: true,
    priority,
    createdAt: now,
    updatedAt: now,
  });

  const plan = await myPlanRepo.findById(planId);
  return c.json({ plan }, 201);
});

// ─── DELETE /myplans/:id - マイプラン削除 ────────────────────

schedulesApi.delete("/myplans/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = await myPlanRepo.findByIdAndUserId(planId, userId);
  if (!existing) return c.json({ error: "MyPlan not found" }, 404);

  await personalEventRepo.deleteByUserAndPlan(userId, planId);
  await myPlanRepo.deleteById(planId);

  return c.json({ message: "MyPlan and associated events deleted" });
});

// ─── Mount sub-routers ───────────────────────────────────────
externalApi.route("/calendar", calendarApi);
externalApi.route("/reminders", remindersApi);
externalApi.route("/schedules", schedulesApi);

export { externalApi };
