import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { m4 } from "../modules/reservation/routes.js";
import { notification } from "../modules/notification/routes.js";
import { m6 } from "../modules/voting/routes.js";
import { auth } from "./auth/routes.js";
import { userContext } from "./middleware/auth.js";
import { initNotificationHandler } from "../modules/notification/core/handler.js";
import { schoolModule } from "../modules/school/index.js";
import type { SchulaModule } from "./shared/types.js";

const app = new Hono();

// ─── Global Error Handler ───────────────────────────────────
app.onError((err, c) => {
  console.error(`[server] 未処理エラー: ${c.req.method} ${c.req.path}`, err);
  return c.json({ error: "Internal server error", message: err.message }, 500);
});

// ─── Global Middleware ──────────────────────────────────────
app.use("*", cors());
app.use("*", logger());
app.use("/api/*", userContext());

// ─── Auth Routes (認証) ─────────────────────────────────────
app.route("/api/auth", auth);

// ─── Core Platform ──────────────────────────────────────────
// 予約システム (Reservations)
app.route("/api/reservations", m4);
// Webhook・通知 (Webhooks & Notifications)
app.route("/api/webhooks", notification);
// 日程調整Voting (Meeting Voting)
app.route("/api/voting", m6);

// ─── Optional Modules ───────────────────────────────────────
const modules: SchulaModule[] = [schoolModule];

for (const mod of modules) {
  app.route(mod.basePath, mod.routes);
}

// ─── Calendar Module (Google Calendar + 手動予定 + プラン) ───
import { calendar } from "../modules/calendar/routes.js";
app.route("/api/calendar", calendar);

// ─── Groups Module (グループ管理) ───────────────────────────
import { groupRoutes } from "../modules/group/routes.js";
app.route("/api/groups", groupRoutes);

// ─── MyPlan Module (マイプラン: 週間ルーティーン) ────────────
import { myPlanRoutes } from "../modules/myplan/routes.js";
app.route("/api/myplans", myPlanRoutes);

// ─── Legacy Compatibility ───────────────────────────────────
// 旧パス (/api/m1, /api/m2, ...) への後方互換ルーティング
// 新規開発では /api/school/m1, /api/reservations, /api/webhooks を使用してください
import { m1 } from "../modules/schedule/routes.js";
import { m2 } from "../modules/integration/routes.js";
import { m3 } from "../modules/auto-scheduler/routes.js";
app.route("/api/m1", m1);
app.route("/api/m2", m2);
app.route("/api/m3", m3);
app.route("/api/m4", m4);
app.route("/api/m5", notification);
app.route("/api/m6", m6);

// /api/timetable → school モジュールへ移動済み (/api/school/timetable)
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "./shared/constants.js";
app.get("/api/timetable", (c) => {
  const periods = Array.from({ length: PERIODS_COUNT }, (_, i) => ({
    period: i + 1,
    ...getPeriodTime(i),
  }));
  return c.json({
    days: DAY_LABELS,
    periods,
    description: "1コマ=1時間, 9:30開始, 月〜日(7日間)",
  });
});

// ─── Health & Info ──────────────────────────────────────────
app.get("/", (c) => {
  const registeredModules: Record<string, string> = {};
  for (const mod of modules) {
    registeredModules[mod.name] = `${mod.description} - ${mod.basePath}`;
  }

  return c.json({
    name: "Schedula",
    description: "汎用スケジューリング & 予約プラットフォーム",
    version: "1.0.0",
    core: {
      reservations: "予約システム - /api/reservations",
      webhooks: "Webhook・リマインド通知 - /api/webhooks",
      voting: "日程調整Voting - /api/voting",
    },
    modules: registeredModules,
  });
});

app.get("/api/health", async (c) => {
  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  // DB 接続チェック（postgres の場合のみ）
  try {
    const { db, dialect } = await import("./db/connection.js");
    health.db_dialect = dialect;
    if (dialect === "postgres") {
      const result = await db.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import("drizzle-orm")).sql`SELECT 1 AS ok`
      );
      health.db_status = "connected";
      console.log("[health] DB check OK");
    } else {
      health.db_status = "connected";
    }
  } catch (err) {
    health.status = "degraded";
    health.db_status = "disconnected";
    health.db_error =
      err instanceof Error ? err.message : String(err);
    console.error(`[health] DB check FAILED: ${health.db_error}`);
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return c.json(health, statusCode);
});

// ─── Initialize Notification Handler ────────────────────────
initNotificationHandler();

// ─── Server ─────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);

console.log(`[server] 起動中... ポート ${port}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] Schedula server running on http://localhost:${info.port}`);
});

export { app };
