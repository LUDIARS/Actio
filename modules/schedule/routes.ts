/**
 * M1 Routes — 学校カリキュラム管理モジュール
 *
 * 統合モジュール: 旧M1(カリキュラムCRUD) + 旧M2(データ統合) + 旧M3(オートスケジューラ)
 *
 * 設定メニュー:
 *   - 学科 (departments): トップレイヤ
 *   - 講師 (instructors): トップレイヤ
 *   - カリキュラム (curricula): 学科の下に複数
 *
 * データ入力:
 *   - カリキュラムに講師をアサイン
 *   - 講師ごとに出講可能曜日・コマを入力
 *   - カリキュラムにタームを設定
 *
 * マイグレーション:
 *   - 登録学科を自動的にグループ登録
 *   - カリキュラム配置データをスケジューラのプラン形式に自動変換
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { requireRole } from "../../src/middleware/auth.js";
import { getUserId } from "../../src/middleware/getUserId.js";
import {
  departmentRepo,
  instructorRepo,
  curriculumRepo,
  curriculumDepartmentRepo,
  availableSlotRepo,
  scheduleEntryRepo,
  groupRepo,
  groupMemberRepo,
  personalEventRepo,
  planRepo,
  groupScheduleRepo,
  userRepo,
  termRepo,
  curriculumPlacementRepo,
  myPlanRepo,
} from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";

const m1 = new Hono();

// M1モジュールは管理者のみ実行可能
m1.use("*", requireRole("admin"));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 学科 (Departments)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 学科一覧 */
m1.get("/departments", async (c) => {
  const departments = await departmentRepo.findAll();
  return c.json({ departments });
});

/** 学科作成 */
m1.post("/departments", async (c) => {
  const userId = getUserId(c) || "";
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const id = uuidv4();
  await departmentRepo.create({ id, name: name.trim() });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "学科作成", `学科「${name.trim()}」が追加されました`);

  return c.json({ id, name: name.trim() }, 201);
});

/** 学科更新 */
m1.put("/departments/:id", async (c) => {
  const userId = getUserId(c) || "";
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  await departmentRepo.update(id, { name: name.trim() });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "学科更新", `学科が「${name.trim()}」に変更されました`);

  return c.json({ id, name: name.trim() });
});

/** 学科削除 */
m1.delete("/departments/:id", async (c) => {
  const { id } = c.req.param();
  await departmentRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 講師 (Instructors)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 講師一覧 */
m1.get("/instructors", async (c) => {
  const instructors = await instructorRepo.findAll();
  return c.json({ instructors });
});

/** 講師作成 */
m1.post("/instructors", async (c) => {
  const userId = getUserId(c) || "";
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const id = uuidv4();
  await instructorRepo.create({ id, name: name.trim() });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "講師作成", `講師「${name.trim()}」が追加されました`);

  return c.json({ id, name: name.trim() }, 201);
});

/** 講師更新 */
m1.put("/instructors/:id", async (c) => {
  const userId = getUserId(c) || "";
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  await instructorRepo.update(id, { name: name.trim() });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "講師更新", `講師が「${name.trim()}」に変更されました`);

  return c.json({ id, name: name.trim() });
});

/** 講師削除 */
m1.delete("/instructors/:id", async (c) => {
  const { id } = c.req.param();
  await instructorRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カリキュラム (Curricula) — 学科の下に複数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 学科に属するカリキュラム一覧 */
m1.get("/departments/:departmentId/curricula", async (c) => {
  const { departmentId } = c.req.param();
  const curricula = await curriculumRepo.findByDepartment(departmentId);
  return c.json({ curricula });
});

/** カリキュラム全件取得 (学科情報付き) */
m1.get("/curricula", async (c) => {
  const curricula = await curriculumRepo.findAll();
  const allCd = await curriculumDepartmentRepo.findAll();
  // 各カリキュラムに departmentIds を付与
  const result = curricula.map((cur) => ({
    ...cur,
    departmentIds: allCd
      .filter((cd) => cd.curriculumId === cur.id)
      .map((cd) => cd.departmentId),
  }));
  return c.json({ curricula: result });
});

/** カリキュラム作成 (複数学科・コマ数・期間対応) */
m1.post("/departments/:departmentId/curricula", async (c) => {
  const { departmentId } = c.req.param();
  const { name, instructorId, periods, departmentIds, termId } = await c.req.json<{
    name: string;
    instructorId?: string;
    periods?: number;
    departmentIds?: string[];
    termId?: string;
  }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const id = uuidv4();
  const periodsVal = periods != null && periods > 0 ? periods : 1;
  await curriculumRepo.create({
    id,
    name: name.trim(),
    departmentId,
    periods: periodsVal,
    instructorId: instructorId || null,
    termId: termId || null,
  });

  // 中間テーブルに学科を登録 (departmentIds が指定されなければ主学科のみ)
  const deptList = departmentIds && departmentIds.length > 0 ? departmentIds : [departmentId];
  for (const dId of deptList) {
    await curriculumDepartmentRepo.create({
      id: uuidv4(),
      curriculumId: id,
      departmentId: dId,
    });
  }

  const userId = getUserId(c) || "";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "カリキュラム作成", `カリキュラム「${name.trim()}」が追加されました`);

  return c.json({
    id, name: name.trim(), departmentId,
    periods: periodsVal,
    instructorId: instructorId || null,
    termId: termId || null,
    departmentIds: deptList,
  }, 201);
});

/** カリキュラム更新 (名前変更・講師アサイン・コマ数・学科変更・期間変更) */
m1.put("/curricula/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    name?: string;
    instructorId?: string | null;
    periods?: number;
    departmentIds?: string[];
    termId?: string | null;
  }>();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.instructorId !== undefined) updates.instructorId = body.instructorId;
  if (body.periods !== undefined && body.periods > 0) updates.periods = body.periods;
  if (body.termId !== undefined) updates.termId = body.termId;

  if (Object.keys(updates).length === 0 && !body.departmentIds) {
    return c.json({ error: "No fields to update" }, 400);
  }

  if (Object.keys(updates).length > 0) {
    await curriculumRepo.update(id, updates);
  }

  // 学科の更新
  if (body.departmentIds) {
    await curriculumDepartmentRepo.deleteByCurriculum(id);
    for (const dId of body.departmentIds) {
      await curriculumDepartmentRepo.create({
        id: uuidv4(),
        curriculumId: id,
        departmentId: dId,
      });
    }
    // 主学科も更新 (最初の学科を主学科とする)
    if (body.departmentIds.length > 0) {
      await curriculumRepo.update(id, { departmentId: body.departmentIds[0] });
    }
  }

  const userId = getUserId(c) || "";
  const userObj = await userRepo.findById(userId);
  logActivity(userId, userObj?.name || "Unknown", "カリキュラム更新", `カリキュラム(${id})が更新されました`);

  return c.json({ id, ...updates, departmentIds: body.departmentIds });
});

/** カリキュラム削除 */
m1.delete("/curricula/:id", async (c) => {
  const { id } = c.req.param();
  await curriculumDepartmentRepo.deleteByCurriculum(id);
  await curriculumRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 出講可能スロット (Instructor Available Slots)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 講師の出講可能スロット一覧 */
m1.get("/instructors/:instructorId/availability", async (c) => {
  const { instructorId } = c.req.param();
  const slots = await availableSlotRepo.findByInstructor(instructorId);
  return c.json({ slots });
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
  await availableSlotRepo.deleteByInstructor(instructorId);

  // 新規挿入
  const inserted = [];
  for (const slot of slots) {
    if (slot.day < 0 || slot.day > 6) continue;
    if (!Array.isArray(slot.periods) || slot.periods.length === 0) continue;

    const id = uuidv4();
    await availableSlotRepo.create({
      id,
      instructorId,
      day: slot.day,
      periods: slot.periods,
    });
    inserted.push({ id, instructorId, day: slot.day, periods: slot.periods });
  }

  const userId = getUserId(c) || "";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "出講可能スロット設定", `講師(${instructorId})の出講可能スロットが更新されました`);

  return c.json({ slots: inserted });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ターム (Terms) — カリキュラム期間管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ターム一覧 */
m1.get("/terms", async (c) => {
  const terms = await termRepo.findAll();
  return c.json({ terms });
});

/** ターム作成 */
m1.post("/terms", async (c) => {
  const { name, startDate, endDate } = await c.req.json<{
    name: string;
    startDate: string;
    endDate: string;
  }>();
  if (!name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  if (!startDate || !endDate) {
    return c.json({ error: "startDate and endDate are required" }, 400);
  }
  const id = uuidv4();
  await termRepo.create({
    id,
    name: name.trim(),
    startDate,
    endDate,
  });

  const userId = getUserId(c) || "";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "ターム作成", `ターム「${name.trim()}」が追加されました`);

  return c.json({ id, name: name.trim(), startDate, endDate }, 201);
});

/** ターム更新 */
m1.put("/terms/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
  }>();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.startDate !== undefined) updates.startDate = body.startDate;
  if (body.endDate !== undefined) updates.endDate = body.endDate;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }
  await termRepo.update(id, updates);
  return c.json({ id, ...updates });
});

/** ターム削除 */
m1.delete("/terms/:id", async (c) => {
  const { id } = c.req.param();
  // 配置データも削除
  await curriculumPlacementRepo.deleteByTerm(id);
  await termRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カリキュラム配置 (Curriculum Placements) — ターム単位で管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ターム別の配置データ取得 */
m1.get("/terms/:termId/placements", async (c) => {
  const { termId } = c.req.param();
  const placements = await curriculumPlacementRepo.findByTerm(termId);
  return c.json({ placements });
});

/** 配置データを一括保存 (既存を置換) */
m1.put("/terms/:termId/placements", async (c) => {
  const { termId } = c.req.param();
  const { placements } = await c.req.json<{
    placements: Array<{
      curriculumId: string;
      day: number;
      period: number;
      roomId?: string;
      candidateCount?: number;
    }>;
  }>();

  if (!Array.isArray(placements)) {
    return c.json({ error: "placements array is required" }, 400);
  }

  // 既存配置を削除
  await curriculumPlacementRepo.deleteByTerm(termId);

  // 新規挿入
  for (const p of placements) {
    await curriculumPlacementRepo.create({
      id: uuidv4(),
      termId,
      curriculumId: p.curriculumId,
      day: p.day,
      period: p.period,
      roomId: p.roomId || null,
      candidateCount: p.candidateCount ?? 0,
    });
  }

  const userId = getUserId(c) || "";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "配置データ保存", `ターム(${termId})の配置データが更新されました (${placements.length}件)`);

  return c.json({ message: `${placements.length}件の配置を保存しました`, count: placements.length });
});

/** 配置データのブロックスワップ (連続コマ単位で移動) */
m1.post("/terms/:termId/placements/swap", async (c) => {
  const { termId } = c.req.param();
  const { fromDay, fromPeriod, toDay, toPeriod } = await c.req.json<{
    fromDay: number;
    fromPeriod: number;
    toDay: number;
    toPeriod: number;
  }>();

  const placements = await curriculumPlacementRepo.findByTerm(termId);

  const fromEntry = placements.find(
    (p) => p.day === fromDay && p.period === fromPeriod
  );
  if (!fromEntry) {
    return c.json({ error: "スワップ元にデータがありません" }, 400);
  }

  // fromEntry と同じカリキュラム・同じ曜日の連続ブロックを取得
  const fromBlock = placements
    .filter((p) => p.day === fromDay && p.curriculumId === fromEntry.curriculumId)
    .sort((a, b) => a.period - b.period);
  // 連続性を確認して from のブロックを抽出
  const fromIdx = fromBlock.findIndex((p) => p.period === fromPeriod);
  let lo = fromIdx;
  while (lo > 0 && fromBlock[lo - 1].period === fromBlock[lo].period - 1) lo--;
  let hi = fromIdx;
  while (hi < fromBlock.length - 1 && fromBlock[hi + 1].period === fromBlock[hi].period + 1) hi++;
  const fromContiguous = fromBlock.slice(lo, hi + 1);
  const blockSize = fromContiguous.length;
  const fromStartPeriod = fromContiguous[0].period;

  // 移動先ブロックを確認
  const toEntry = placements.find(
    (p) => p.day === toDay && p.period === toPeriod
  );

  const periodDelta = toPeriod - fromStartPeriod;
  const dayDelta = toDay - fromDay;

  if (toEntry) {
    // 移動先のブロックを取得
    const toBlock = placements
      .filter((p) => p.day === toDay && p.curriculumId === toEntry.curriculumId)
      .sort((a, b) => a.period - b.period);
    const toIdx = toBlock.findIndex((p) => p.period === toPeriod);
    let tLo = toIdx;
    while (tLo > 0 && toBlock[tLo - 1].period === toBlock[tLo].period - 1) tLo--;
    let tHi = toIdx;
    while (tHi < toBlock.length - 1 && toBlock[tHi + 1].period === toBlock[tHi].period + 1) tHi++;
    const toContiguous = toBlock.slice(tLo, tHi + 1);

    if (toContiguous.length !== blockSize) {
      return c.json({ error: "異なるブロックサイズ同士の入れ替えはできません" }, 400);
    }

    // 双方向ブロックスワップ
    for (const p of fromContiguous) await curriculumPlacementRepo.deleteById(p.id);
    for (const p of toContiguous) await curriculumPlacementRepo.deleteById(p.id);

    for (const p of fromContiguous) {
      await curriculumPlacementRepo.create({
        id: uuidv4(), termId,
        curriculumId: p.curriculumId,
        day: p.day + dayDelta, period: p.period + periodDelta,
        roomId: p.roomId, candidateCount: p.candidateCount,
      });
    }
    for (const p of toContiguous) {
      await curriculumPlacementRepo.create({
        id: uuidv4(), termId,
        curriculumId: p.curriculumId,
        day: p.day - dayDelta, period: p.period - periodDelta,
        roomId: p.roomId, candidateCount: p.candidateCount,
      });
    }
  } else {
    // 片方向ブロック移動
    for (const p of fromContiguous) await curriculumPlacementRepo.deleteById(p.id);
    for (const p of fromContiguous) {
      await curriculumPlacementRepo.create({
        id: uuidv4(), termId,
        curriculumId: p.curriculumId,
        day: p.day + dayDelta, period: p.period + periodDelta,
        roomId: p.roomId, candidateCount: p.candidateCount,
      });
    }
  }

  return c.json({ message: "ブロックスワップが完了しました" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カリキュラム決定 (Plan Decision) — ターム単位でプランに変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * POST /terms/:termId/decide
 *
 * 対象タームの配置データをプランに変換する。
 * - 「カリキュラム{ターム名}」のラベルを付与してプランデータを作成
 * - 再実行時は対象ラベルを持つプランを削除してから再作成
 * - 各学科ごとにプランを作成
 */
m1.post("/terms/:termId/decide", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const { termId } = c.req.param();

  // ターム情報取得
  const term = await termRepo.findById(termId);
  if (!term) return c.json({ error: "ターム が見つかりません" }, 404);

  // 配置データ取得
  const placements = await curriculumPlacementRepo.findByTerm(termId);
  if (placements.length === 0) {
    return c.json({ error: "配置データがありません" }, 400);
  }

  // カリキュラム・学科情報を取得
  const curricula = await curriculumRepo.findAll();
  const curriculumMap = new Map(curricula.map((cur) => [cur.id, cur]));
  const departments = await departmentRepo.findAll();
  const departmentMap = new Map(departments.map((d) => [d.id, d]));
  const allCd = await curriculumDepartmentRepo.findAll();

  // ラベルパターン: 「カリキュラム{ターム名}」
  const labelPrefix = `カリキュラム${term.name}`;

  // 既存のプランを削除 (同じラベルを持つプラン)
  await planRepo.deleteByUserIdAndNameLike(userId, `${labelPrefix}%`);

  // 学科ごとに配置データを集約
  const placementsByDept = new Map<string, Array<{
    day: number;
    period: number;
    curriculumName: string;
    curriculumId: string;
    periods: number;
  }>>();

  for (const placement of placements) {
    const curriculum = curriculumMap.get(placement.curriculumId);
    if (!curriculum) continue;

    // カリキュラムの所属学科を取得
    const cdEntries = allCd.filter((cd) => cd.curriculumId === curriculum.id);
    const deptIds = cdEntries.length > 0
      ? cdEntries.map((cd) => cd.departmentId)
      : [curriculum.departmentId];

    for (const deptId of deptIds) {
      if (!placementsByDept.has(deptId)) {
        placementsByDept.set(deptId, []);
      }
      placementsByDept.get(deptId)!.push({
        day: placement.day,
        period: placement.period,
        curriculumName: curriculum.name,
        curriculumId: curriculum.id,
        periods: curriculum.periods || 1,
      });
    }
  }

  // 各学科ごとにプランを作成
  let plansCreated = 0;
  const results: Array<{ departmentName: string; plansCreated: number }> = [];

  for (const [deptId, deptPlacements] of placementsByDept) {
    const dept = departmentMap.get(deptId);
    if (!dept) continue;

    // 曜日ごとにグルーピング
    const byDay = new Map<number, number[]>();
    for (const p of deptPlacements) {
      if (!byDay.has(p.day)) byDay.set(p.day, []);
      byDay.get(p.day)!.push(p.period);
    }

    let deptPlansCreated = 0;
    const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];

    for (const [day, periods] of byDay) {
      const sorted = [...new Set(periods)].sort((a, b) => a - b);
      // 連続コマをグルーピング
      const ranges: Array<{ start: number; duration: number }> = [];
      let rangeStart = sorted[0];
      let rangeEnd = sorted[0];

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === rangeEnd + 1) {
          rangeEnd = sorted[i];
        } else {
          ranges.push({ start: rangeStart, duration: rangeEnd - rangeStart + 1 });
          rangeStart = sorted[i];
          rangeEnd = sorted[i];
        }
      }
      ranges.push({ start: rangeStart, duration: rangeEnd - rangeStart + 1 });

      for (const range of ranges) {
        const planId = uuidv4();
        const now = new Date();
        await planRepo.create({
          id: planId,
          userId,
          name: `${labelPrefix} ${dept.name} (${dayLabels[day]}${range.start + 1}限)`,
          description: `ターム「${term.name}」学科「${dept.name}」のカリキュラム配置から自動生成`,
          days: [day],
          startPeriod: range.start,
          duration: range.duration,
          eventType: "school_event",
          isPrivate: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        deptPlansCreated++;
        plansCreated++;
      }
    }

    results.push({ departmentName: dept.name, plansCreated: deptPlansCreated });
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "カリキュラム決定", `ターム「${term.name}」のカリキュラムを決定しました (${plansCreated}件のプラン作成)`);

  return c.json({
    message: `カリキュラム「${term.name}」を決定しました (${plansCreated}件のプラン作成)`,
    labelPrefix,
    plansCreated,
    results,
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// エクスポート / インポート (Export / Import)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** カリキュラムデータ一括エクスポート */
m1.get("/export", async (c) => {
  const departments = await departmentRepo.findAll();
  const instructorsList = await instructorRepo.findAll();
  const curriculaList = await curriculumRepo.findAll();
  const allCd = await curriculumDepartmentRepo.findAll();
  const terms = await termRepo.findAll();

  // 講師の出講可能スロットも取得
  const availabilityMap: Record<string, Array<{ day: number; periods: number[] }>> = {};
  for (const inst of instructorsList) {
    const slots = await availableSlotRepo.findByInstructor(inst.id);
    if (slots.length > 0) {
      availabilityMap[inst.id] = slots.map((s) => ({
        day: s.day,
        periods: (typeof s.periods === "string" ? JSON.parse(s.periods) : s.periods) as number[],
      }));
    }
  }

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    departments: departments.map((d) => ({ name: d.name })),
    instructors: instructorsList.map((i) => ({
      name: i.name,
      availability: availabilityMap[i.id] || [],
    })),
    curricula: curriculaList.map((cur) => {
      const cdEntries = allCd.filter((cd) => cd.curriculumId === cur.id);
      const instructor = instructorsList.find((i) => i.id === cur.instructorId);
      return {
        name: cur.name,
        departmentName: departments.find((d) => d.id === cur.departmentId)?.name || "",
        instructorName: instructor?.name || null,
        periods: cur.periods,
        termId: cur.termId,
        departmentNames: cdEntries.map((cd) =>
          departments.find((d) => d.id === cd.departmentId)?.name || ""
        ).filter(Boolean),
      };
    }),
    terms: terms.map((t) => ({
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
  };

  return c.json(exportData);
});

/** カリキュラムデータ一括インポート */
m1.post("/import", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    departments?: Array<{ name: string }>;
    instructors?: Array<{ name: string; availability?: Array<{ day: number; periods: number[] }> }>;
    curricula?: Array<{
      name: string;
      departmentName: string;
      instructorName?: string | null;
      periods?: number;
      departmentNames?: string[];
    }>;
    termName?: string;
    termStartDate?: string;
    termEndDate?: string;
  }>();

  let deptCreated = 0;
  let instCreated = 0;
  let currCreated = 0;
  let termCreatedFlag = false;

  // 既存データ取得
  const existingDepts = await departmentRepo.findAll();
  const existingInsts = await instructorRepo.findAll();
  const deptNameMap = new Map(existingDepts.map((d) => [d.name, d.id]));
  const instNameMap = new Map(existingInsts.map((i) => [i.name, i.id]));

  // 学科インポート
  if (body.departments) {
    for (const dept of body.departments) {
      if (!deptNameMap.has(dept.name)) {
        const id = uuidv4();
        await departmentRepo.create({ id, name: dept.name });
        deptNameMap.set(dept.name, id);
        deptCreated++;
      }
    }
  }

  // 講師インポート
  if (body.instructors) {
    for (const inst of body.instructors) {
      if (!instNameMap.has(inst.name)) {
        const id = uuidv4();
        await instructorRepo.create({ id, name: inst.name });
        instNameMap.set(inst.name, id);
        instCreated++;
      }
      // 出講可能スロット設定
      if (inst.availability && inst.availability.length > 0) {
        const instId = instNameMap.get(inst.name)!;
        await availableSlotRepo.deleteByInstructor(instId);
        for (const slot of inst.availability) {
          await availableSlotRepo.create({
            id: uuidv4(),
            instructorId: instId,
            day: slot.day,
            periods: slot.periods,
          });
        }
      }
    }
  }

  // カリキュラムインポート
  if (body.curricula) {
    for (const cur of body.curricula) {
      const deptId = deptNameMap.get(cur.departmentName);
      if (!deptId) continue;
      const instId = cur.instructorName ? instNameMap.get(cur.instructorName) : null;

      const id = uuidv4();
      await curriculumRepo.create({
        id,
        name: cur.name,
        departmentId: deptId,
        periods: cur.periods || 1,
        instructorId: instId || null,
      });

      // 学科関連付け
      const deptNames = cur.departmentNames && cur.departmentNames.length > 0
        ? cur.departmentNames
        : [cur.departmentName];
      for (const dName of deptNames) {
        const dId = deptNameMap.get(dName);
        if (dId) {
          await curriculumDepartmentRepo.create({
            id: uuidv4(),
            curriculumId: id,
            departmentId: dId,
          });
        }
      }

      currCreated++;
    }
  }

  // ターム作成 (インポート時に新規タームを設定可能)
  let termId: string | null = null;
  if (body.termName) {
    termId = uuidv4();
    await termRepo.create({
      id: termId,
      name: body.termName,
      startDate: body.termStartDate || "",
      endDate: body.termEndDate || "",
    });
    termCreatedFlag = true;
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "カリキュラムインポート",
    `学科${deptCreated}件、講師${instCreated}件、カリキュラム${currCreated}件をインポートしました`);

  return c.json({
    message: `インポート完了: 学科${deptCreated}件、講師${instCreated}件、カリキュラム${currCreated}件`,
    departmentsCreated: deptCreated,
    instructorsCreated: instCreated,
    curriculaCreated: currCreated,
    termCreated: termCreatedFlag,
    termId,
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// マイグレーション (Migration)
// 登録学科→グループ自動登録、カリキュラム配置→プラン自動変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マイグレーション状態確認 — 既存グループとの紐付け状況 */
m1.get("/migration/status", async (c) => {
  const departments = await departmentRepo.findAll();
  const groups = await groupRepo.findAll();

  // 学科名で既存グループとマッチング
  const status = departments.map((dept) => {
    const matchedGroup = groups.find((g: { name: string }) => g.name === dept.name);
    return {
      departmentId: dept.id,
      departmentName: dept.name,
      groupId: matchedGroup?.id || null,
      migrated: !!matchedGroup,
    };
  });

  return c.json({
    departments: status,
    totalDepartments: departments.length,
    migratedCount: status.filter((s) => s.migrated).length,
  });
});

/**
 * POST /migration/departments-to-groups
 *
 * 登録学科を自動的にグループ登録するマイグレーション
 * - 各学科に対応するグループを作成
 * - 管理者(実行ユーザー)を学校主(owner)として登録 (変更不可)
 * - 既に同名グループが存在する場合はスキップ
 */
m1.post("/migration/departments-to-groups", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const departments = await departmentRepo.findAll();
  const existingGroups = await groupRepo.findAll();
  const existingGroupNames = new Set(existingGroups.map((g: { name: string }) => g.name));

  const created: Array<{ departmentId: string; departmentName: string; groupId: string }> = [];
  const skipped: Array<{ departmentId: string; departmentName: string; reason: string }> = [];

  for (const dept of departments) {
    if (existingGroupNames.has(dept.name)) {
      skipped.push({
        departmentId: dept.id,
        departmentName: dept.name,
        reason: "同名グループが既に存在します",
      });
      continue;
    }

    const groupId = uuidv4();
    await groupRepo.create({
      id: groupId,
      name: dept.name,
      description: `学科「${dept.name}」から自動生成されたグループ`,
      members: [],
      createdBy: userId,
      createdAt: new Date(),
    });

    // 管理者を owner として登録 (学校主)
    await groupMemberRepo.create({
      id: uuidv4(),
      groupId,
      userId,
      role: "owner",
      joinedAt: new Date(),
    });

    created.push({
      departmentId: dept.id,
      departmentName: dept.name,
      groupId,
    });
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "学科→グループ変換", `${created.length}件の学科をグループに変換しました`);

  return c.json({
    message: `${created.length}件のグループを作成しました`,
    created,
    skipped,
  });
});

/**
 * POST /migration/schedule-to-plans
 *
 * カリキュラム配置データをスケジューラのプラン形式に自動変換
 * - 確定済みスケジュールエントリがある場合はそれを使用
 * - エントリがない場合はカリキュラムと講師の出講可能スロットから自動配置
 * - 講師の出講可能スロットを参照し、配置可能な曜日・コマのみを使用
 */
m1.post("/migration/schedule-to-plans", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const { termId } = await c.req.json<{ termId?: string }>();
  const currentTerm = termId || `term-${new Date().getFullYear()}`;

  // カリキュラム・学科・グループ情報を取得
  const curricula = await curriculumRepo.findAll();
  const departments = await departmentRepo.findAll();
  const departmentMap = new Map(departments.map((d) => [d.id, d]));
  const groups = await groupRepo.findAll();
  const groupByName = new Map<string, { id: string; name: string }>(groups.map((g: { id: string; name: string }) => [g.name, g]));

  // 講師の出講可能スロットを一括取得
  const instructorAvailMap = new Map<string, Set<string>>();
  const instructorIds = [...new Set(
    curricula.map((cur) => cur.instructorId).filter((id): id is string => !!id)
  )];
  for (const instrId of instructorIds) {
    const slots = await availableSlotRepo.findByInstructor(instrId);
    const slotKeys = new Set<string>();
    for (const slot of slots) {
      const periods = (typeof slot.periods === "string" ? JSON.parse(slot.periods) : slot.periods) as number[];
      for (const p of periods) {
        slotKeys.add(`${slot.day}-${p}`);
      }
    }
    instructorAvailMap.set(instrId, slotKeys);
  }

  // 確定済みスケジュールエントリを取得
  const entries = await scheduleEntryRepo.findConfirmedByTerm(currentTerm);
  const curriculumMap = new Map(curricula.map((cur) => [cur.id, cur]));

  // 学科ごとの配置データを収集 (day, period, curriculumName の配列)
  type PlacementEntry = { day: number; period: number; curriculumName: string };
  const placementsByDepartment = new Map<string, PlacementEntry[]>();

  if (entries.length > 0) {
    // ── 既存スケジュールエントリから変換 (講師スロットでフィルタリング) ──
    for (const entry of entries) {
      const curriculum = curriculumMap.get(entry.curriculumId);
      if (!curriculum) continue;

      // 講師の出講可能スロットをチェック
      if (curriculum.instructorId) {
        const instrSlots = instructorAvailMap.get(curriculum.instructorId);
        if (instrSlots && instrSlots.size > 0 && !instrSlots.has(`${entry.day}-${entry.period}`)) {
          // 講師の出講可能スロットが設定されているが、このスロットは含まれない → スキップ
          continue;
        }
      }

      const deptId = curriculum.departmentId;
      if (!placementsByDepartment.has(deptId)) {
        placementsByDepartment.set(deptId, []);
      }
      placementsByDepartment.get(deptId)!.push({
        day: entry.day,
        period: entry.period,
        curriculumName: curriculum.name,
      });
    }
  } else {
    // ── スケジュールエントリなし: カリキュラム + 講師スロットから自動配置 ──

    // 講師ごとの占有スロット (同一講師が複数学科で重複しないように)
    const instructorOccupied = new Map<string, Set<string>>();

    // 学科ごとにカリキュラムをグルーピング
    const curriculaByDept = new Map<string, typeof curricula>();
    for (const cur of curricula) {
      if (!curriculaByDept.has(cur.departmentId)) {
        curriculaByDept.set(cur.departmentId, []);
      }
      curriculaByDept.get(cur.departmentId)!.push(cur);
    }

    for (const [deptId, deptCurricula] of curriculaByDept) {
      const deptOccupied = new Set<string>(); // 学科内の配置済みスロット
      const placements: PlacementEntry[] = [];

      for (const cur of deptCurricula) {
        const periodsNeeded = cur.periods || 1;

        // 講師の出講可能スロットを取得
        let candidateSlots: Array<{ day: number; period: number }> = [];
        if (cur.instructorId) {
          const instrSlots = instructorAvailMap.get(cur.instructorId);
          if (instrSlots && instrSlots.size > 0) {
            for (const key of instrSlots) {
              const [d, p] = key.split("-").map(Number);
              candidateSlots.push({ day: d, period: p });
            }
          } else {
            // 講師に出講可能スロットが未設定 → 月〜金の全コマを候補
            for (let d = 0; d < 5; d++) {
              for (let p = 0; p < 11; p++) {
                candidateSlots.push({ day: d, period: p });
              }
            }
          }
        } else {
          // 講師未設定: 月〜金の全コマを候補とする
          for (let d = 0; d < 5; d++) {
            for (let p = 0; p < 11; p++) {
              candidateSlots.push({ day: d, period: p });
            }
          }
        }

        // 曜日→コマ順でソート
        candidateSlots.sort((a, b) => a.day !== b.day ? a.day - b.day : a.period - b.period);

        // 講師の占有状況を取得
        const instrOccupied = cur.instructorId
          ? (instructorOccupied.get(cur.instructorId) ?? new Set<string>())
          : null;

        // 連続コマが確保できるスロットを探す
        for (const slot of candidateSlots) {
          let canPlace = true;
          for (let p = slot.period; p < slot.period + periodsNeeded; p++) {
            const key = `${slot.day}-${p}`;
            if (p >= 11 || deptOccupied.has(key)) {
              canPlace = false;
              break;
            }
            // 同一講師が他学科で既に配置済みでないか
            if (instrOccupied && instrOccupied.has(key)) {
              canPlace = false;
              break;
            }
            // 講師の出講可能スロットに含まれるか (設定済みの場合)
            if (cur.instructorId) {
              const instrSlots = instructorAvailMap.get(cur.instructorId);
              if (instrSlots && instrSlots.size > 0 && !instrSlots.has(key)) {
                canPlace = false;
                break;
              }
            }
          }

          if (canPlace) {
            for (let p = slot.period; p < slot.period + periodsNeeded; p++) {
              const key = `${slot.day}-${p}`;
              deptOccupied.add(key);
              // 講師の占有も記録
              if (cur.instructorId) {
                if (!instructorOccupied.has(cur.instructorId)) {
                  instructorOccupied.set(cur.instructorId, new Set());
                }
                instructorOccupied.get(cur.instructorId)!.add(key);
              }
              placements.push({ day: slot.day, period: p, curriculumName: cur.name });
            }
            break;
          }
        }
      }

      if (placements.length > 0) {
        placementsByDepartment.set(deptId, placements);
      }
    }
  }

  // 学科ごとにプランを作成
  let convertedCount = 0;
  const results: Array<{
    departmentName: string;
    groupId: string | null;
    plansCreated: number;
  }> = [];

  for (const [deptId, deptPlacements] of placementsByDepartment) {
    const dept = departmentMap.get(deptId);
    if (!dept) continue;

    const group = groupByName.get(dept.name);

    // 曜日ごとにエントリを集約してプランに変換
    const byDay = new Map<number, number[]>();
    for (const placement of deptPlacements) {
      if (!byDay.has(placement.day)) byDay.set(placement.day, []);
      byDay.get(placement.day)!.push(placement.period);
    }

    // 各曜日の連続コマをプランとして登録
    let plansCreated = 0;
    for (const [day, periods] of byDay) {
      const sorted = [...new Set(periods)].sort((a, b) => a - b);
      // 連続するコマをグルーピング
      const ranges: Array<{ start: number; duration: number }> = [];
      let rangeStart = sorted[0];
      let rangeEnd = sorted[0];

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === rangeEnd + 1) {
          rangeEnd = sorted[i];
        } else {
          ranges.push({ start: rangeStart, duration: rangeEnd - rangeStart + 1 });
          rangeStart = sorted[i];
          rangeEnd = sorted[i];
        }
      }
      ranges.push({ start: rangeStart, duration: rangeEnd - rangeStart + 1 });

      for (const range of ranges) {
        const planId = uuidv4();
        const now = new Date();

        await planRepo.create({
          id: planId,
          userId,
          name: `${dept.name} カリキュラム (${["月", "火", "水", "木", "金", "土", "日"][day]}${range.start + 1}限)`,
          description: `学科「${dept.name}」のカリキュラムから自動生成`,
          days: [day],
          startPeriod: range.start,
          duration: range.duration,
          eventType: "school_event",
          isPrivate: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

        plansCreated++;
        convertedCount++;
      }
    }

    results.push({
      departmentName: dept.name,
      groupId: group?.id || null,
      plansCreated,
    });
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "スケジュール→プラン変換", `${convertedCount}件のスケジュールをプランに変換しました`);

  return c.json({
    message: `${convertedCount}件のプランに変換しました`,
    termId: currentTerm,
    results,
    totalConverted: convertedCount,
  });
});

/**
 * POST /confirm-placements
 *
 * 配置結果を確定し、学科名と同じグループのグループスケジュールとして登録する。
 * グループが存在しない場合は作成する。
 */
m1.post("/confirm-placements", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const { placements, label } = await c.req.json<{
    placements: Array<{
      curriculumId: string;
      curriculumName: string;
      day: number;
      period: number;
      duration: number;
      departmentNames: string[];
    }>;
    label?: string;
  }>();

  if (!Array.isArray(placements) || placements.length === 0) {
    return c.json({ error: "placements array is required" }, 400);
  }

  // ラベルが指定されている場合、既存の同一ラベルデータを削除（多重登録防止）
  const termLabel = label || null;
  let deletedCount = 0;
  if (termLabel) {
    const existing = await groupScheduleRepo.findByLabel(termLabel);
    deletedCount = existing.length;
    if (deletedCount > 0) {
      await groupScheduleRepo.deleteByLabel(termLabel);
    }
  }

  const existingGroups = await groupRepo.findAll();
  const groupByName = new Map<string, string>();
  for (const g of existingGroups) {
    groupByName.set(g.name, g.id);
  }

  let groupsCreated = 0;
  let schedulesCreated = 0;

  // 学科ごとにグルーピング
  const byDept = new Map<string, typeof placements>();
  for (const p of placements) {
    for (const deptName of p.departmentNames) {
      if (!byDept.has(deptName)) byDept.set(deptName, []);
      byDept.get(deptName)!.push(p);
    }
  }

  for (const [deptName, deptPlacements] of byDept) {
    // グループを取得 or 作成
    let groupId = groupByName.get(deptName);
    if (!groupId) {
      groupId = uuidv4();
      await groupRepo.create({
        id: groupId,
        name: deptName,
        description: `学科「${deptName}」の配置から自動生成`,
        members: [],
        createdBy: userId,
        createdAt: new Date(),
      });
      await groupMemberRepo.create({
        id: uuidv4(),
        groupId,
        userId,
        role: "owner",
        joinedAt: new Date(),
      });
      groupByName.set(deptName, groupId);
      groupsCreated++;
    }

    // カリキュラムごとにグループスケジュールを登録(重複スキップ)
    const seen = new Set<string>();
    for (const p of deptPlacements) {
      const key = `${p.curriculumId}-${p.day}-${p.period}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const schedId = uuidv4();
      await groupScheduleRepo.create({
        id: schedId,
        groupId,
        title: p.curriculumName,
        day: p.day,
        period: p.period,
        duration: p.duration,
        scheduleType: "recurring",
        label: termLabel,
        createdBy: userId,
        createdAt: new Date(),
      });
      schedulesCreated++;
    }
  }

  return c.json({
    message: `配置を確定しました (${schedulesCreated}件のスケジュール、${groupsCreated}件のグループを作成${deletedCount > 0 ? `、${deletedCount}件の既存データを削除` : ""})`,
    schedulesCreated,
    groupsCreated,
    deletedCount,
    label: termLabel,
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB管理 — グループスケジュールの閲覧・個別削除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** グループスケジュール一覧取得 */
m1.get("/group-schedules", async (c) => {
  const schedules = await groupScheduleRepo.findAll();
  const groups = await groupRepo.findAll();
  const groupMap = new Map(groups.map((g: { id: string; name: string }) => [g.id, g.name]));
  const result = schedules.map((s: { groupId: string; [key: string]: unknown }) => ({
    ...s,
    groupName: groupMap.get(s.groupId) || s.groupId,
  }));
  return c.json({ schedules: result });
});

/** ラベル単位でグループスケジュールを一括削除 */
m1.delete("/group-schedules/by-label/:label", async (c) => {
  const { label } = c.req.param();
  const existing = await groupScheduleRepo.findByLabel(label);
  if (existing.length === 0) {
    return c.json({ message: "該当するデータがありません", deletedCount: 0 });
  }
  await groupScheduleRepo.deleteByLabel(label);

  const userId = getUserId(c) || "";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "ラベル一括削除", `ラベル「${label}」のスケジュール${existing.length}件を削除しました`);

  return c.json({ deletedCount: existing.length, label });
});

/** グループスケジュール個別削除 */
m1.delete("/group-schedules/:id", async (c) => {
  const { id } = c.req.param();
  const schedule = await groupScheduleRepo.findById(id);
  if (!schedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }
  await groupScheduleRepo.deleteById(id);

  const userId = getUserId(c) || "";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "グループスケジュール削除", `グループスケジュール「${schedule.title}」を削除しました`);

  return c.json({ deleted: id });
});

export { m1 };
