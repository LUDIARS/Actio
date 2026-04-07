/**
 * WS Command Handlers — MyPlan module
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  myPlanRepo,
  personalEventRepo,
  userRepo,
} from "../../db/repository.js";
import { logActivity } from "../../activity-logger.js";

// ── Helper types ──

interface WeeklySlot {
  startTime: string;
  endTime: string;
  title: string;
  period?: number;
  duration?: number;
}

// ── Helper: 時刻文字列 → 分数 ──

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function timeToPeriod(time: string): number {
  const minutes = timeToMinutes(time);
  const periodStart = 9 * 60 + 30;
  return Math.max(0, Math.floor((minutes - periodStart) / 60));
}

// ── Helper: マイプランから予定を自動生成 ──

async function generateScheduleFromMyPlan(
  planId: string,
  userId: string,
  plan: {
    name: string;
    weeklySchedule: Record<string, WeeklySlot[]>;
  },
): Promise<number> {
  await personalEventRepo.deleteByUserAndPlan(userId, planId);

  const now = new Date();
  let created = 0;

  for (const [dayKey, slots] of Object.entries(plan.weeklySchedule)) {
    const day = parseInt(dayKey);
    if (day < 0 || day > 6) continue;

    for (const slot of slots) {
      const startTime = slot.startTime;
      const endTime = slot.endTime;

      const period = startTime ? timeToPeriod(startTime) : (slot.period ?? 0);
      const startMin = startTime ? timeToMinutes(startTime) : undefined;
      const endMin = endTime ? timeToMinutes(endTime) : undefined;
      const duration = (startMin != null && endMin != null)
        ? Math.max(1, Math.ceil((endMin - startMin) / 60))
        : (slot.duration ?? 1);

      const conflict = await personalEventRepo.findByUserDayPeriod(userId, day, period);
      if (conflict) continue;

      await personalEventRepo.create({
        id: uuidv4(),
        userId,
        title: slot.title || plan.name,
        day,
        period,
        duration,
        startTime: startTime || null,
        endTime: endTime || null,
        eventType: "personal",
        planId,
        isPrivate: true,
        createdAt: now,
        updatedAt: now,
      });

      created++;
    }
  }

  return created;
}

// ── myplan.create ──

interface CreateMyPlanPayload {
  name: string;
  patternType?: string;
  validFrom?: string;
  validUntil?: string;
  weeklySchedule?: Record<string, WeeklySlot[]>;
  groupId?: string;
}

registerCommand("myplan", "create", async (userId, payload) => {
  const body = payload as CreateMyPlanPayload;
  if (!body.name) throw new Error("name is required");

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

  let generatedEvents = 0;
  if (body.weeklySchedule && Object.keys(body.weeklySchedule).length > 0) {
    generatedEvents = await generateScheduleFromMyPlan(planId, userId, {
      name: body.name,
      weeklySchedule: body.weeklySchedule,
    });
  }

  const plan = await myPlanRepo.findById(planId);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "マイプラン作成", `マイプラン「${body.name}」が追加されました`);

  return { plan, generatedEvents };
});

// ── myplan.update ──

interface UpdateMyPlanPayload {
  id: string;
  name?: string;
  patternType?: string;
  validFrom?: string;
  validUntil?: string;
  weeklySchedule?: Record<string, WeeklySlot[]>;
  isActive?: boolean;
}

registerCommand("myplan", "update", async (userId, payload) => {
  const body = payload as UpdateMyPlanPayload;
  const planId = body.id;
  if (!planId) throw new Error("id is required");

  const existing = await myPlanRepo.findByIdAndUserId(planId, userId);
  if (!existing) throw new Error("MyPlan not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.patternType !== undefined) {
    updates.patternType = body.patternType;
    updates.priority = body.patternType === "special" ? 10 : 0;
  }
  if (body.validFrom !== undefined) updates.validFrom = body.validFrom;
  if (body.validUntil !== undefined) updates.validUntil = body.validUntil;
  if (body.weeklySchedule !== undefined) updates.weeklySchedule = body.weeklySchedule;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  await myPlanRepo.update(planId, updates);

  const updated = await myPlanRepo.findById(planId);

  let generatedEvents = 0;
  if (updated?.isActive) {
    generatedEvents = await generateScheduleFromMyPlan(planId, userId, {
      name: updated.name,
      weeklySchedule: updated.weeklySchedule as Record<string, WeeklySlot[]>,
    });
  } else {
    await personalEventRepo.deleteByUserAndPlan(userId, planId);
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "マイプラン更新", `マイプラン「${updated?.name || planId}」が更新されました`);

  return { plan: updated, generatedEvents };
});

// ── myplan.delete ──

interface DeleteMyPlanPayload {
  id: string;
}

registerCommand("myplan", "delete", async (userId, payload) => {
  const body = payload as DeleteMyPlanPayload;
  const planId = body.id;
  if (!planId) throw new Error("id is required");

  const existing = await myPlanRepo.findByIdAndUserId(planId, userId);
  if (!existing) throw new Error("MyPlan not found");

  await personalEventRepo.deleteByUserAndPlan(userId, planId);
  await myPlanRepo.deleteById(planId);

  return { message: "MyPlan and associated events deleted" };
});

// ── myplan.generate ──

interface GenerateMyPlanPayload {
  id: string;
}

registerCommand("myplan", "generate", async (userId, payload) => {
  const body = payload as GenerateMyPlanPayload;
  const planId = body.id;
  if (!planId) throw new Error("id is required");

  const plan = await myPlanRepo.findByIdAndUserId(planId, userId);
  if (!plan) throw new Error("MyPlan not found");
  if (!plan.isActive) throw new Error("MyPlan is not active");

  const createdCount = await generateScheduleFromMyPlan(planId, userId, {
    name: plan.name,
    weeklySchedule: plan.weeklySchedule as Record<string, WeeklySlot[]>,
  });

  return { generatedEvents: createdCount };
});
