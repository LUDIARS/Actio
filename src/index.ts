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

// ─── Auth Routes (認証) — コア ──────────────────────────────
app.route("/api/auth", auth);

// ─── Core: Groups (グループ管理) ────────────────────────────
import { groupRoutes } from "../modules/group/routes.js";
app.route("/api/groups", groupRoutes);

// ─── Core: Calendar (Google Calendar + 手動予定 + プラン) ────
import { calendar } from "../modules/calendar/routes.js";
app.route("/api/calendar", calendar);

// ─── Core: MyPlan (マイプラン: 週間ルーティーン) ─────────────
import { myPlanRoutes } from "../modules/myplan/routes.js";
app.route("/api/myplans", myPlanRoutes);

// ─── Core: Smart Scheduler (自動配置スケジューラ) ────────────
import { smartScheduler } from "../modules/smart-scheduler/routes.js";
app.route("/api/smart-scheduler", smartScheduler);

// ─── Module: Reservations (予約システム) ─────────────────────
app.route("/api/reservations", m4);

// ─── Module: Webhooks & Notifications ───────────────────────
app.route("/api/webhooks", notification);

// ─── Module: Voting (日程調整) ──────────────────────────────
app.route("/api/voting", m6);

// ─── School Module (学校カリキュラム管理: M1) ────────────────
const modules: SchulaModule[] = [schoolModule];

for (const mod of modules) {
  app.route(mod.basePath, mod.routes);
}

// ─── Legacy Compatibility ───────────────────────────────────
// 旧パス (/api/m1) への後方互換ルーティング
// M2/M3 は M1 に統合済みのため廃止
import { m1 } from "../modules/schedule/routes.js";
app.route("/api/m1", m1);
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

// ─── Admin DB Viewer (テスト用) ──────────────────────────────
import { dbViewer } from "./admin/db-viewer.js";
app.route("/api/admin/db", dbViewer);

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
      auth: "認証 - /api/auth",
      groups: "グループ管理 - /api/groups",
      calendar: "カレンダー & 手動予定 - /api/calendar",
      myplans: "マイプラン - /api/myplans",
      smartScheduler: "自動配置スケジューラ - /api/smart-scheduler",
    },
    modules: {
      ...registeredModules,
      reservations: "予約システム - /api/reservations",
      webhooks: "Webhook・リマインド通知 - /api/webhooks",
      voting: "日程調整Voting - /api/voting",
    },
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
console.log(`[server] FRONTEND_URL = ${process.env.FRONTEND_URL || "http://localhost:8080"}`);
console.log(`[server] GOOGLE_REDIRECT_URI = ${process.env.GOOGLE_REDIRECT_URI || "http://localhost:8080/api/auth/google/callback"}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] Schedula server running on http://localhost:${info.port}`);
});

export { app };
