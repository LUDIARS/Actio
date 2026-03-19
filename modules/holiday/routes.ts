/**
 * Holiday module — 休日・休業期間管理
 *
 * - 日本の祝日自動取得
 * - グループ・システム全体の休日管理
 * - 休日判定API
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { holidayRepo, groupMemberRepo, userRepo } from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";
import { getJapaneseHolidays, isNonBusinessDay } from "./japanese-holidays.js";

const holidayRoutes = new Hono();

// ─── GET /japanese/:year - 日本の祝日一覧 (DB登録不要) ─────────

holidayRoutes.get("/japanese/:year", async (c) => {
  const year = parseInt(c.req.param("year"));
  if (isNaN(year) || year < 1900 || year > 2100) {
    return c.json({ error: "Invalid year" }, 400);
  }
  const holidays = getJapaneseHolidays(year);
  return c.json({ holidays, year });
});

// ─── POST /japanese/sync - 日本の祝日をDBに一括登録 ──────────

holidayRoutes.post("/japanese/sync", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const { year, groupId } = await c.req.json<{ year?: number; groupId?: string }>();
  const targetYear = year || new Date().getFullYear();

  // グループ指定時はメンバーシップ確認
  if (groupId) {
    const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
    if (!membership) return c.json({ error: "Not a group member" }, 403);
  }

  const holidays = getJapaneseHolidays(targetYear);

  // 既存の自動取得データを削除
  const source = `japanese_holidays_${targetYear}`;
  await holidayRepo.deleteBySource(source, groupId || undefined);

  // 新規登録
  let created = 0;
  for (const h of holidays) {
    await holidayRepo.create({
      id: uuidv4(),
      groupId: groupId || null,
      name: h.name,
      date: h.date,
      endDate: null,
      holidayType: "national_holiday",
      recurrence: "none",
      source,
      createdBy: userId,
    });
    created++;
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "祝日同期",
    `${targetYear}年の日本の祝日を${created}件登録しました`);

  return c.json({
    message: `${targetYear}年の祝日を${created}件登録しました`,
    year: targetYear,
    count: created,
  });
});

// ─── GET / - 休日一覧 ────────────────────────────────────────

holidayRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.query("groupId");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  let holidays;
  if (startDate && endDate) {
    holidays = await holidayRepo.findByDateRange(startDate, endDate, groupId || undefined);
  } else if (groupId) {
    holidays = await holidayRepo.findForGroup(groupId);
  } else {
    holidays = await holidayRepo.findAll();
  }

  return c.json({ holidays });
});

// ─── POST / - 休日追加 ───────────────────────────────────────

holidayRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    groupId?: string;
    name: string;
    date: string;
    endDate?: string;
    holidayType?: string;
    recurrence?: string;
  }>();

  if (!body.name || !body.date) {
    return c.json({ error: "name and date are required" }, 400);
  }

  // グループ指定時はメンバーシップ確認
  if (body.groupId) {
    const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
    if (!membership) return c.json({ error: "Not a group member" }, 403);
  }

  const id = uuidv4();
  await holidayRepo.create({
    id,
    groupId: body.groupId || null,
    name: body.name,
    date: body.date,
    endDate: body.endDate || null,
    holidayType: body.holidayType || "custom",
    recurrence: body.recurrence || "none",
    source: null,
    createdBy: userId,
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "休日追加", `休日「${body.name}」を追加しました`);

  return c.json({ id, name: body.name, date: body.date }, 201);
});

// ─── DELETE /:id - 休日削除 ──────────────────────────────────

holidayRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const holiday = await holidayRepo.findById(id);
  if (!holiday) return c.json({ error: "Holiday not found" }, 404);

  await holidayRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ─── GET /check/:date - 指定日が休日かチェック ─────────────────

holidayRoutes.get("/check/:date", async (c) => {
  const dateStr = c.req.param("date");
  const groupId = c.req.query("groupId");

  // 日本の祝日・土日チェック
  const isNonBusiness = isNonBusinessDay(dateStr);

  // DB登録の休日もチェック
  let dbHolidays;
  if (groupId) {
    dbHolidays = await holidayRepo.findByDateRange(dateStr, dateStr, groupId);
  } else {
    dbHolidays = await holidayRepo.findByDateRange(dateStr, dateStr);
  }

  const isHoliday = isNonBusiness || dbHolidays.length > 0;

  return c.json({
    date: dateStr,
    isHoliday,
    isWeekend: isNonBusiness && !getJapaneseHolidays(parseInt(dateStr.slice(0, 4))).some((h) => h.date === dateStr),
    isNationalHoliday: isNonBusiness,
    dbHolidays: dbHolidays.map((h) => ({ name: h.name, type: h.holidayType })),
  });
});

export { holidayRoutes };
