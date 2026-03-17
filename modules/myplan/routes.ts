import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { myPlanRepo, personalEventRepo } from "../../src/db/repository.js";

const myPlanRoutes = new Hono();

// ─── Helper: 時刻文字列 "HH:MM" → 分数に変換 ────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ─── Helper: 時刻からperiod番号を算出 (レガシー互換) ──────────
// period 0 = 09:30, period 1 = 10:30, ...

function timeToPeriod(time: string): number {
  const minutes = timeToMinutes(time);
  const periodStart = 9 * 60 + 30; // 09:30
  return Math.max(0, Math.floor((minutes - periodStart) / 60));
}

// ─── Helper: マイプランから予定を自動生成 ─────────────────────

interface WeeklySlot {
  startTime: string;
  endTime: string;
  title: string;
  // レガシー互換
  period?: number;
  duration?: number;
}

async function generateScheduleFromMyPlan(
  planId: string,
  userId: string,
  plan: {
    name: string;
    weeklySchedule: Record<string, WeeklySlot[]>;
  }
) {
  // まず既存のプラン由来イベントを削除
  await personalEventRepo.deleteByUserAndPlan(userId, planId);

  const now = new Date();
  let created = 0;

  for (const [dayKey, slots] of Object.entries(plan.weeklySchedule)) {
    const day = parseInt(dayKey);
    if (day < 0 || day > 6) continue;

    for (const slot of slots) {
      // 時間ベースのスロット
      const startTime = slot.startTime;
      const endTime = slot.endTime;

      // レガシー互換: period は startTime から算出
      const period = startTime ? timeToPeriod(startTime) : (slot.period ?? 0);
      const startMin = startTime ? timeToMinutes(startTime) : undefined;
      const endMin = endTime ? timeToMinutes(endTime) : undefined;
      const duration = (startMin != null && endMin != null)
        ? Math.max(1, Math.ceil((endMin - startMin) / 60))
        : (slot.duration ?? 1);

      // 重複チェック (period ベース)
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

// ─── GET / - マイプラン一覧 ──────────────────────────────────

myPlanRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const plans = await myPlanRepo.findByUserId(userId);

  // 優先度でソート（specialが先）
  plans.sort((a, b) => {
    if (a.patternType !== b.patternType) {
      return a.patternType === "special" ? -1 : 1;
    }
    return b.priority - a.priority;
  });

  return c.json({ plans });
});

// ─── POST / - マイプラン作成 + 予定自動生成 ──────────────────

myPlanRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

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

  // 予定を自動生成
  let generatedEvents = 0;
  if (body.weeklySchedule && Object.keys(body.weeklySchedule).length > 0) {
    generatedEvents = await generateScheduleFromMyPlan(planId, userId, {
      name: body.name,
      weeklySchedule: body.weeklySchedule,
    });
  }

  const plan = await myPlanRepo.findById(planId);

  return c.json({ plan, generatedEvents }, 201);
});

// ─── PUT /:id - マイプラン更新 + 予定再生成 ──────────────────

myPlanRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = await myPlanRepo.findByIdAndUserId(planId, userId);

  if (!existing) return c.json({ error: "MyPlan not found" }, 404);

  const body = await c.req.json<{
    name?: string;
    patternType?: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule?: Record<string, WeeklySlot[]>;
    isActive?: boolean;
  }>();

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

  // 有効なら再生成、無効なら関連イベント削除
  let generatedEvents = 0;
  if (updated?.isActive) {
    generatedEvents = await generateScheduleFromMyPlan(planId, userId, {
      name: updated.name,
      weeklySchedule: updated.weeklySchedule as Record<string, WeeklySlot[]>,
    });
  } else {
    await personalEventRepo.deleteByUserAndPlan(userId, planId);
  }

  return c.json({ plan: updated, generatedEvents });
});

// ─── DELETE /:id - マイプラン削除 ────────────────────────────

myPlanRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = await myPlanRepo.findByIdAndUserId(planId, userId);

  if (!existing) return c.json({ error: "MyPlan not found" }, 404);

  // プラン由来のイベントを削除
  await personalEventRepo.deleteByUserAndPlan(userId, planId);

  // プラン本体を削除
  await myPlanRepo.deleteById(planId);

  return c.json({ message: "MyPlan and associated events deleted" });
});

// ─── POST /:id/generate - マイプランから予定を生成 ────────────

myPlanRoutes.post("/:id/generate", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const plan = await myPlanRepo.findByIdAndUserId(planId, userId);

  if (!plan) return c.json({ error: "MyPlan not found" }, 404);
  if (!plan.isActive) return c.json({ error: "MyPlan is not active" }, 400);

  const createdCount = await generateScheduleFromMyPlan(planId, userId, {
    name: plan.name,
    weeklySchedule: plan.weeklySchedule as Record<string, WeeklySlot[]>,
  });

  return c.json({ generatedEvents: createdCount });
});

export { myPlanRoutes };
