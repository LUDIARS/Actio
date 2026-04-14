/**
 * WS Command Handlers — Calendar module
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  userRepo,
  personalEventRepo,
  planRepo,
} from "../../db/repository.js";
import { getUserInfo } from "../../auth/user-info.js";
import { logActivity } from "../../activity-logger.js";

// ── Helper: period → 時刻変換 (09:30 + period * 60min) ──

function periodToTime(period: number): { startTime: string; endTime: string } {
  const startHour = 9 + Math.floor((30 + period * 60) / 60);
  const startMin = (30 + period * 60) % 60;
  const endHour = startHour + 1;
  const fmt = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { startTime: fmt(startHour, startMin), endTime: fmt(endHour, startMin) };
}

// ── Helper: プランからイベントを自動生成 ──

async function generateEventsFromPlan(
  planId: string,
  userId: string,
  plan: {
    name: string;
    days: number[];
    startPeriod: number;
    duration: number;
    eventType: string;
    isPrivate: boolean;
  },
): Promise<number> {
  await personalEventRepo.deleteByUserAndPlan(userId, planId);

  const now = new Date();
  let created = 0;

  for (const day of plan.days) {
    for (let p = 0; p < plan.duration; p++) {
      const period = plan.startPeriod + p;
      if (period > 10) continue;

      const conflict = await personalEventRepo.findByUserDayPeriod(userId, day, period);
      if (conflict) continue;

      const times = periodToTime(period);
      await personalEventRepo.create({
        id: uuidv4(),
        userId,
        title: plan.name,
        day,
        period,
        duration: 1,
        startTime: times.startTime,
        endTime: times.endTime,
        eventType: plan.eventType,
        planId,
        isPrivate: plan.isPrivate,
        createdAt: now,
        updatedAt: now,
      });

      created++;
    }
  }

  return created;
}

// ── calendar.create_event ──

interface CreateEventPayload {
  title: string;
  description?: string;
  day: number;
  period: number;
  duration?: number;
  startTime?: string;
  endTime?: string;
  eventType?: string;
  isPrivate?: boolean;
}

registerCommand("calendar", "create_event", async (userId, payload) => {
  const body = payload as CreateEventPayload;

  if (!body.title || body.day == null || body.period == null) {
    throw new Error("title, day, period are required");
  }
  if (body.day < 0 || body.day > 6) throw new Error("day must be 0-6");
  if (body.period < 0 || body.period > 10) throw new Error("period must be 0-10");

  const existing = await personalEventRepo.findByUserDayPeriod(userId, body.day, body.period);
  if (existing) throw new Error("このスロットには既に予定があります");

  const id = uuidv4();
  const now = new Date();

  const times = body.startTime && body.endTime
    ? { startTime: body.startTime, endTime: body.endTime }
    : periodToTime(body.period);

  await personalEventRepo.create({
    id,
    userId,
    title: body.title,
    description: body.description || null,
    day: body.day,
    period: body.period,
    duration: body.duration || 1,
    startTime: times.startTime,
    endTime: times.endTime,
    eventType: body.eventType || "personal",
    isPrivate: body.isPrivate !== false,
    createdAt: now,
    updatedAt: now,
  });

  const created = await personalEventRepo.findById(id);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "手動予定追加", `予定「${body.title}」が追加されました`);

  return { event: created };
});

// ── calendar.update_event ──

interface UpdateEventPayload {
  id: string;
  title?: string;
  description?: string;
  day?: number;
  period?: number;
  duration?: number;
  eventType?: string;
  isPrivate?: boolean;
}

registerCommand("calendar", "update_event", async (userId, payload) => {
  const body = payload as UpdateEventPayload;
  const eventId = body.id;
  if (!eventId) throw new Error("id is required");

  const existing = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!existing) throw new Error("Event not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.day !== undefined) updates.day = body.day;
  if (body.period !== undefined) updates.period = body.period;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined) updates.eventType = body.eventType;
  if (body.isPrivate !== undefined) updates.isPrivate = body.isPrivate;

  await personalEventRepo.update(eventId, updates);

  const updated = await personalEventRepo.findById(eventId);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "手動予定更新", `予定「${updated?.title || eventId}」が更新されました`);

  return { event: updated };
});

// ── calendar.delete_event ──

interface DeleteEventPayload {
  id: string;
}

registerCommand("calendar", "delete_event", async (userId, payload) => {
  const body = payload as DeleteEventPayload;
  const eventId = body.id;
  if (!eventId) throw new Error("id is required");

  const existing = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!existing) throw new Error("Event not found");

  await personalEventRepo.deleteById(eventId);

  return { message: "Event deleted" };
});

// ── calendar.create_plan ──

interface CreatePlanPayload {
  name: string;
  description?: string;
  days: number[];
  startPeriod: number;
  duration?: number;
  eventType?: string;
  isPrivate?: boolean;
}

registerCommand("calendar", "create_plan", async (userId, payload) => {
  const body = payload as CreatePlanPayload;

  if (!body.name || !body.days?.length || body.startPeriod == null) {
    throw new Error("name, days, startPeriod are required");
  }

  for (const d of body.days) {
    if (d < 0 || d > 6) throw new Error("days must contain values 0-6");
  }
  if (body.startPeriod < 0 || body.startPeriod > 10) {
    throw new Error("startPeriod must be 0-10");
  }

  const planId = uuidv4();
  const now = new Date();
  const duration = body.duration || 1;
  const eventType = body.eventType || "personal";
  const isPrivate = body.isPrivate !== false;

  await planRepo.create({
    id: planId,
    userId,
    name: body.name,
    description: body.description || null,
    days: body.days,
    startPeriod: body.startPeriod,
    duration,
    eventType,
    isPrivate,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const createdCount = await generateEventsFromPlan(planId, userId, {
    name: body.name,
    days: body.days,
    startPeriod: body.startPeriod,
    duration,
    eventType,
    isPrivate,
  });

  const plan = await planRepo.findById(planId);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "プラン作成", `プラン「${body.name}」が追加されました`);

  return { plan, generatedEvents: createdCount };
});

// ── calendar.update_plan ──

interface UpdatePlanPayload {
  id: string;
  name?: string;
  description?: string;
  days?: number[];
  startPeriod?: number;
  duration?: number;
  eventType?: string;
  isPrivate?: boolean;
  isActive?: boolean;
}

registerCommand("calendar", "update_plan", async (userId, payload) => {
  const body = payload as UpdatePlanPayload;
  const planId = body.id;
  if (!planId) throw new Error("id is required");

  const existing = await planRepo.findByIdAndUserId(planId, userId);
  if (!existing) throw new Error("Plan not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.days !== undefined) updates.days = body.days;
  if (body.startPeriod !== undefined) updates.startPeriod = body.startPeriod;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined) updates.eventType = body.eventType;
  if (body.isPrivate !== undefined) updates.isPrivate = body.isPrivate;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  await planRepo.update(planId, updates);

  const updated = await planRepo.findById(planId);

  let generatedEvents = 0;
  if (updated?.isActive) {
    generatedEvents = await generateEventsFromPlan(planId, userId, {
      name: updated.name,
      days: updated.days as number[],
      startPeriod: updated.startPeriod,
      duration: updated.duration,
      eventType: updated.eventType,
      isPrivate: updated.isPrivate,
    });
  } else {
    await personalEventRepo.deleteByUserAndPlan(userId, planId);
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "プラン更新", `プラン「${updated?.name || planId}」が更新されました`);

  return { plan: updated, generatedEvents };
});

// ── calendar.delete_plan ──

interface DeletePlanPayload {
  id: string;
}

registerCommand("calendar", "delete_plan", async (userId, payload) => {
  const body = payload as DeletePlanPayload;
  const planId = body.id;
  if (!planId) throw new Error("id is required");

  const existing = await planRepo.findByIdAndUserId(planId, userId);
  if (!existing) throw new Error("Plan not found");

  await personalEventRepo.deleteByUserAndPlan(userId, planId);
  await planRepo.deleteById(planId);

  return { message: "Plan and associated events deleted" };
});

// ── calendar.regenerate_plan ──

interface RegeneratePlanPayload {
  id: string;
}

registerCommand("calendar", "regenerate_plan", async (userId, payload) => {
  const body = payload as RegeneratePlanPayload;
  const planId = body.id;
  if (!planId) throw new Error("id is required");

  const plan = await planRepo.findByIdAndUserId(planId, userId);
  if (!plan) throw new Error("Plan not found");
  if (!plan.isActive) throw new Error("Plan is not active");

  const createdCount = await generateEventsFromPlan(planId, userId, {
    name: plan.name,
    days: plan.days as number[],
    startPeriod: plan.startPeriod,
    duration: plan.duration,
    eventType: plan.eventType,
    isPrivate: plan.isPrivate,
  });

  return { generatedEvents: createdCount };
});

// ── calendar.disconnect_google ──
// Google OAuth トークンは Cernere 側で管理する (個人データ保管禁止ルール)。
// Schedula 側では calendarAccessId のみクリアする。

registerCommand("calendar", "disconnect_google", async (userId) => {
  const info = await getUserInfo(userId);

  await userRepo.update(userId, {
    calendarAccessId: null,
    updatedAt: new Date(),
  });

  logActivity(userId, info.name, "Google Calendar連携解除", "Google Calendarの連携が解除されました");

  return { message: "Google Calendar disconnected" };
});
