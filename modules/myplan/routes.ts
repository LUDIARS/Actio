import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { myPlanRepo, personalEventRepo } from "../../src/db/repository.js";

const myPlanRoutes = new Hono();

// ─── Helper: マイプランから予定を自動生成 ─────────────────────
// 基本パターンと特別パターンを考慮し、特別パターンが優先される

async function generateScheduleFromMyPlan(
  planId: string,
  userId: string,
  plan: {
    name: string;
    weeklySchedule: Record<string, Array<{ period: number; duration: number; title: string }>>;
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
      for (let p = 0; p < slot.duration; p++) {
        const period = slot.period + p;
        if (period > 10) continue;

        // 他ソースの予定との重複チェック
        const conflict = await personalEventRepo.findByUserDayPeriod(userId, day, period);

        if (conflict) continue;

        await personalEventRepo.create({
          id: uuidv4(),
          userId,
          title: slot.title || plan.name,
          day,
          period,
          duration: 1,
          eventType: "personal",
          planId,
          isPrivate: true,
          createdAt: now,
          updatedAt: now,
        });

        created++;
      }
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
    weeklySchedule?: Record<string, Array<{ period: number; duration: number; title: string }>>;
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
    weeklySchedule?: Record<string, Array<{ period: number; duration: number; title: string }>>;
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
      weeklySchedule: updated.weeklySchedule as Record<string, Array<{ period: number; duration: number; title: string }>>,
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
    weeklySchedule: plan.weeklySchedule as Record<string, Array<{ period: number; duration: number; title: string }>>,
  });

  return c.json({ generatedEvents: createdCount });
});

export { myPlanRoutes };
