import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";
import { getUserId } from "../../src/middleware/getUserId.js";

const myPlanRoutes = new Hono();

// ─── Helper: マイプランから予定を自動生成 ─────────────────────
// 基本パターンと特別パターンを考慮し、特別パターンが優先される

function generateScheduleFromMyPlan(
  planId: string,
  userId: string,
  plan: {
    name: string;
    weeklySchedule: Record<string, Array<{ period: number; duration: number; title: string }>>;
  }
) {
  // まず既存のプラン由来イベントを削除
  db.delete(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.userId, userId),
        eq(schema.personalEvents.planId, planId)
      )
    )
    .run();

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
        const conflict = db
          .select()
          .from(schema.personalEvents)
          .where(
            and(
              eq(schema.personalEvents.userId, userId),
              eq(schema.personalEvents.day, day),
              eq(schema.personalEvents.period, period)
            )
          )
          .get();

        if (conflict) continue;

        db.insert(schema.personalEvents)
          .values({
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
          })
          .run();

        created++;
      }
    }
  }

  return created;
}

// ─── GET / - マイプラン一覧 ──────────────────────────────────

myPlanRoutes.get("/", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const plans = db
    .select()
    .from(schema.myPlans)
    .where(eq(schema.myPlans.userId, userId))
    .all();

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

  db.insert(schema.myPlans)
    .values({
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
    })
    .run();

  // 予定を自動生成
  let generatedEvents = 0;
  if (body.weeklySchedule && Object.keys(body.weeklySchedule).length > 0) {
    generatedEvents = generateScheduleFromMyPlan(planId, userId, {
      name: body.name,
      weeklySchedule: body.weeklySchedule,
    });
  }

  const plan = db
    .select()
    .from(schema.myPlans)
    .where(eq(schema.myPlans.id, planId))
    .get();

  return c.json({ plan, generatedEvents }, 201);
});

// ─── PUT /:id - マイプラン更新 + 予定再生成 ──────────────────

myPlanRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = db
    .select()
    .from(schema.myPlans)
    .where(
      and(
        eq(schema.myPlans.id, planId),
        eq(schema.myPlans.userId, userId)
      )
    )
    .get();

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

  db.update(schema.myPlans)
    .set(updates)
    .where(eq(schema.myPlans.id, planId))
    .run();

  const updated = db
    .select()
    .from(schema.myPlans)
    .where(eq(schema.myPlans.id, planId))
    .get();

  // 有効なら再生成、無効なら関連イベント削除
  let generatedEvents = 0;
  if (updated.isActive) {
    generatedEvents = generateScheduleFromMyPlan(planId, userId, {
      name: updated.name,
      weeklySchedule: updated.weeklySchedule as Record<string, Array<{ period: number; duration: number; title: string }>>,
    });
  } else {
    db.delete(schema.personalEvents)
      .where(
        and(
          eq(schema.personalEvents.userId, userId),
          eq(schema.personalEvents.planId, planId)
        )
      )
      .run();
  }

  return c.json({ plan: updated, generatedEvents });
});

// ─── DELETE /:id - マイプラン削除 ────────────────────────────

myPlanRoutes.delete("/:id", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = db
    .select()
    .from(schema.myPlans)
    .where(
      and(
        eq(schema.myPlans.id, planId),
        eq(schema.myPlans.userId, userId)
      )
    )
    .get();

  if (!existing) return c.json({ error: "MyPlan not found" }, 404);

  // プラン由来のイベントを削除
  db.delete(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.userId, userId),
        eq(schema.personalEvents.planId, planId)
      )
    )
    .run();

  // プラン本体を削除
  db.delete(schema.myPlans)
    .where(eq(schema.myPlans.id, planId))
    .run();

  return c.json({ message: "MyPlan and associated events deleted" });
});

// ─── POST /:id/generate - マイプランから予定を生成 ────────────

myPlanRoutes.post("/:id/generate", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const plan = db
    .select()
    .from(schema.myPlans)
    .where(
      and(
        eq(schema.myPlans.id, planId),
        eq(schema.myPlans.userId, userId)
      )
    )
    .get();

  if (!plan) return c.json({ error: "MyPlan not found" }, 404);
  if (!plan.isActive) return c.json({ error: "MyPlan is not active" }, 400);

  const createdCount = generateScheduleFromMyPlan(planId, userId, {
    name: plan.name,
    weeklySchedule: plan.weeklySchedule as Record<string, Array<{ period: number; duration: number; title: string }>>,
  });

  return c.json({ generatedEvents: createdCount });
});

export { myPlanRoutes };
