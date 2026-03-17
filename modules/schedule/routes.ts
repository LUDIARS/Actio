/**
 * M1 Routes — 学科・講師・カリキュラム・出講可能スロットの CRUD
 *
 * 設定メニュー:
 *   - 学科 (departments): トップレイヤ
 *   - 講師 (instructors): トップレイヤ
 *   - カリキュラム (curricula): 学科の下に複数
 *
 * データ入力:
 *   - カリキュラムに講師をアサイン
 *   - 講師ごとに出講可能曜日・コマを入力
 *
 * 時間割配置は M2 で実施
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, curriculumSchema } from "../../src/db/connection.js";
import { eq } from "drizzle-orm";
import { requireRole } from "../../src/middleware/auth.js";

const m1 = new Hono();

// M1モジュールは管理者のみ実行可能
m1.use("*", requireRole("admin"));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 学科 (Departments)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 学科一覧 */
m1.get("/departments", async (c) => {
  const rows = db.select().from(curriculumSchema.departments).all();
  return c.json({ departments: rows });
});

/** 学科作成 */
m1.post("/departments", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const id = uuidv4();
  db.insert(curriculumSchema.departments)
    .values({ id, name: name.trim() })
    .run();
  return c.json({ id, name: name.trim() }, 201);
});

/** 学科更新 */
m1.put("/departments/:id", async (c) => {
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  db.update(curriculumSchema.departments)
    .set({ name: name.trim() })
    .where(eq(curriculumSchema.departments.id, id))
    .run();
  return c.json({ id, name: name.trim() });
});

/** 学科削除 */
m1.delete("/departments/:id", async (c) => {
  const { id } = c.req.param();
  db.delete(curriculumSchema.departments)
    .where(eq(curriculumSchema.departments.id, id))
    .run();
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 講師 (Instructors)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 講師一覧 */
m1.get("/instructors", async (c) => {
  const rows = db.select().from(curriculumSchema.instructors).all();
  return c.json({ instructors: rows });
});

/** 講師作成 */
m1.post("/instructors", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const id = uuidv4();
  db.insert(curriculumSchema.instructors)
    .values({ id, name: name.trim() })
    .run();
  return c.json({ id, name: name.trim() }, 201);
});

/** 講師更新 */
m1.put("/instructors/:id", async (c) => {
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  db.update(curriculumSchema.instructors)
    .set({ name: name.trim() })
    .where(eq(curriculumSchema.instructors.id, id))
    .run();
  return c.json({ id, name: name.trim() });
});

/** 講師削除 */
m1.delete("/instructors/:id", async (c) => {
  const { id } = c.req.param();
  db.delete(curriculumSchema.instructors)
    .where(eq(curriculumSchema.instructors.id, id))
    .run();
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カリキュラム (Curricula) — 学科の下に複数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 学科に属するカリキュラム一覧 */
m1.get("/departments/:departmentId/curricula", async (c) => {
  const { departmentId } = c.req.param();
  const rows = db
    .select()
    .from(curriculumSchema.curricula)
    .where(eq(curriculumSchema.curricula.departmentId, departmentId))
    .all();
  return c.json({ curricula: rows });
});

/** カリキュラム全件取得 */
m1.get("/curricula", async (c) => {
  const rows = db.select().from(curriculumSchema.curricula).all();
  return c.json({ curricula: rows });
});

/** カリキュラム作成 */
m1.post("/departments/:departmentId/curricula", async (c) => {
  const { departmentId } = c.req.param();
  const { name, instructorId } = await c.req.json<{
    name: string;
    instructorId?: string;
  }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const id = uuidv4();
  db.insert(curriculumSchema.curricula)
    .values({
      id,
      name: name.trim(),
      departmentId,
      instructorId: instructorId || null,
    })
    .run();
  return c.json({ id, name: name.trim(), departmentId, instructorId: instructorId || null }, 201);
});

/** カリキュラム更新 (名前変更・講師アサイン) */
m1.put("/curricula/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ name?: string; instructorId?: string | null }>();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.instructorId !== undefined) updates.instructorId = body.instructorId;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  db.update(curriculumSchema.curricula)
    .set(updates)
    .where(eq(curriculumSchema.curricula.id, id))
    .run();
  return c.json({ id, ...updates });
});

/** カリキュラム削除 */
m1.delete("/curricula/:id", async (c) => {
  const { id } = c.req.param();
  db.delete(curriculumSchema.curricula)
    .where(eq(curriculumSchema.curricula.id, id))
    .run();
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 出講可能スロット (Instructor Available Slots)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 講師の出講可能スロット一覧 */
m1.get("/instructors/:instructorId/availability", async (c) => {
  const { instructorId } = c.req.param();
  const rows = db
    .select()
    .from(curriculumSchema.instructorAvailableSlots)
    .where(eq(curriculumSchema.instructorAvailableSlots.instructorId, instructorId))
    .all();
  return c.json({ slots: rows });
});

/** 講師の出講可能スロットを一括設定 (既存データを置換) */
m1.put("/instructors/:instructorId/availability", async (c) => {
  const { instructorId } = c.req.param();
  const { slots } = await c.req.json<{
    slots: { day: number; periods: number[] }[];
  }>();

  if (!Array.isArray(slots)) {
    return c.json({ error: "slots array is required" }, 400);
  }

  // 既存データ削除
  db.delete(curriculumSchema.instructorAvailableSlots)
    .where(eq(curriculumSchema.instructorAvailableSlots.instructorId, instructorId))
    .run();

  // 新規挿入
  const inserted = [];
  for (const slot of slots) {
    if (slot.day < 0 || slot.day > 6) continue;
    if (!Array.isArray(slot.periods) || slot.periods.length === 0) continue;

    const id = uuidv4();
    db.insert(curriculumSchema.instructorAvailableSlots)
      .values({
        id,
        instructorId,
        day: slot.day,
        periods: slot.periods,
      })
      .run();
    inserted.push({ id, instructorId, day: slot.day, periods: slot.periods });
  }

  return c.json({ slots: inserted });
});

export { m1 };
