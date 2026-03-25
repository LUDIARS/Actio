import { Hono } from "hono";
import { cors } from "hono/cors";
import { userContext, requireRole } from "./middleware/auth.js";
import { auth } from "./auth/routes.js";
import { notification } from "../modules/notification/routes.js";
import { m6 } from "../modules/voting/routes.js";
import { groupRoutes } from "../modules/group/routes.js";
import { calendar } from "../modules/calendar/routes.js";
import { myPlanRoutes } from "../modules/myplan/routes.js";
import { smartScheduler } from "../modules/smart-scheduler/routes.js";
import { schoolModule } from "../modules/school/index.js";
import { m1 } from "../modules/schedule/routes.js";
import { holidayRoutes } from "../modules/holiday/routes.js";
import { integrations } from "../modules/integrations/index.js";
import { dbViewer } from "./admin/db-viewer.js";
import { settingsRoutes } from "../modules/settings/routes.js";
import { secretsRoutes } from "../modules/secrets/routes.js";
import { initNotificationHandler } from "../modules/notification/core/handler.js";
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "./shared/constants.js";
import type { SchulaModule } from "./shared/types.js";
import { getRecentLogs } from "./activity-logger.js";
import { getReservationPlugins } from "./reservation-plugins.js";
import { registerReservationPlugin } from "./reservation-plugins.js";
import { secretManager } from "./config/secrets.js";

export function createApp() {
  const app = new Hono();

  // ─── Global Error Handler ───────────────────────────────────
  app.onError((err, c) => {
    console.error(`[server] 未処理エラー: ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "Internal server error", message: err.message }, 500);
  });

  // ─── Global Middleware ──────────────────────────────────────
  app.use("*", cors({
    origin: secretManager.getOrDefault("CORS_ORIGIN",
      secretManager.getOrDefault("FRONTEND_URL", "http://localhost:8080")),
  }));

  // Security headers
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "1; mode=block");
    if (secretManager.get("NODE_ENV") === "production") {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  app.use("/api/*", userContext());

  // ─── Auth Routes (認証) — コア ──────────────────────────────
  app.route("/api/auth", auth);

  // ─── Core: Groups (グループ管理) ────────────────────────────
  app.route("/api/groups", groupRoutes);

  // ─── Core: Calendar (Google Calendar + 手動予定 + プラン) ────
  app.route("/api/calendar", calendar);

  // ─── Core: MyPlan (マイプラン: 週間ルーティーン) ─────────────
  app.route("/api/myplans", myPlanRoutes);

  // ─── Core: Smart Scheduler (自動配置スケジューラ) ────────────
  app.route("/api/smart-scheduler", smartScheduler);

  // ─── Module: Webhooks & Notifications ───────────────────────
  app.route("/api/webhooks", notification);

  // ─── Module: Voting (日程調整) ──────────────────────────────
  app.route("/api/voting", m6);

  // ─── Module: Holidays (休日管理) ──────────────────────────────
  app.route("/api/holidays", holidayRoutes);

  // ─── Module: Integrations (外部サービス連携) ──────────────────
  app.route("/api/integrations", integrations);

  // ─── School Module (学校カリキュラム管理 + 施設予約: M1) ─────
  const modules: SchulaModule[] = [schoolModule];
  for (const mod of modules) {
    app.route(mod.basePath, mod.routes);
  }

  // ─── Legacy Compatibility ───────────────────────────────────
  app.route("/api/m1", m1);
  app.route("/api/m5", notification);
  app.route("/api/m6", m6);

  // ─── Reservation Plugin Registry ──────────────────────────
  // 日程調整 (Voting) をプラグイン登録
  registerReservationPlugin({
    id: "voting",
    name: "日程調整",
    description: "投票で日程を決定",
    icon: "CalendarCheck",
    apiBasePath: "/api/voting",
    frontendPath: "/voting",
    operations: {
      list: "/events",
      create: "/events",
      cancel: "/events",
    },
  });

  // ─── Reservation Plugins API ──────────────────────────────
  app.get("/api/reservations/plugins", (c) => {
    return c.json({ plugins: getReservationPlugins() });
  });

  // ─── Timetable ─────────────────────────────────────────────
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

  // ─── Admin Settings (設定管理) ───────────────────────────────
  app.route("/api/settings", settingsRoutes);

  // ─── Admin Secrets (シークレット管理: Infisical) ────────────
  app.route("/api/secrets", secretsRoutes);

  // ─── Admin: Activity Logs (操作ログ) ────────────────────────
  app.get("/api/admin/activity-logs", requireRole("admin"), async (c) => {
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;
    const logs = getRecentLogs(limit);
    return c.json({ logs });
  });

  // ─── Admin DB Viewer ───────────────────────────────────────
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
        webhooks: "Webhook・リマインド通知 - /api/webhooks",
        voting: "日程調整Voting - /api/voting",
        integrations: "外部サービス連携 (Google Calendar同期・Notion) - /api/integrations",
      },
      reservationPlugins: getReservationPlugins().map((p) => ({
        id: p.id,
        name: p.name,
        path: p.frontendPath,
      })),
    });
  });

  app.get("/api/health", async (c) => {
    const health: Record<string, unknown> = {
      status: "ok",
      timestamp: new Date().toISOString(),
    };

    try {
      const { db, dialect } = await import("./db/connection.js");
      health.db_dialect = dialect;
      if (dialect === "postgres") {
        await db.execute(
          (await import("drizzle-orm")).sql`SELECT 1 AS ok`
        );
      }
      health.db_status = "connected";
    } catch (err) {
      health.status = "degraded";
      health.db_status = "disconnected";
      health.db_error = err instanceof Error ? err.message : String(err);
    }

    const statusCode = health.status === "ok" ? 200 : 503;
    return c.json(health, statusCode);
  });

  // ─── Initialize Notification Handler ────────────────────────
  initNotificationHandler();

  return app;
}
