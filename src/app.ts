import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { userContext, requireRole } from "./middleware/auth.js";
import { requestId } from "./middleware/request-id.js";
import { setupWebSocket } from "./ws/handler.js";
import "./ws/commands/index.js";
import { auth, compositeAuthRoutes } from "./auth/routes.js";
import { notification } from "../modules/notification/routes.js";
import { groupRoutes } from "../modules/group/routes.js";
import { calendar } from "../modules/calendar/routes.js";
import { eventRoutes } from "../modules/event/routes.js";
import { taskRoutes } from "../modules/task/routes.js";
import { placementRoutes } from "../modules/placement/routes.js";
// myPlan / smart-scheduler / school / schedule(m1) / integrations は SDK module に移行
import { pmModule } from "../modules/pm/index.js";
import { dbViewer } from "./admin/db-viewer.js";
import { externalApi } from "../modules/external-api/routes.js";
import { settingsRoutes } from "../modules/settings/routes.js";
import { secretsRoutes } from "../modules/secrets/routes.js";
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "./shared/constants.js";
import type { ActioModule } from "./shared/types.js";
import { getRecentLogs } from "./activity-logger.js";
import { getReservationPlugins } from "./reservation-plugins.js";
import { registerReservationPlugin } from "./reservation-plugins.js";
import { getEventPlugins } from "./event-plugins.js";
import { getTaskPlugins } from "./task-plugins.js";
import { secretManager } from "./config/secrets.js";
import { setupRoutes } from "../modules/setup/routes.js";
import { profileRoutes } from "../modules/profile/routes.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { moduleAdminRoutes } from "./plugins/admin-routes.js";
import { installModule } from "./plugins/loader.js";
import { issueLinkRoutes } from "./plugins/links-routes.js";
import { commentRoutes } from "./plugins/comments-routes.js";
import { customFieldRoutes } from "./plugins/custom-fields-routes.js";
import { dynamicInstallRoutes } from "./plugins/dynamic-loader.js";
import exampleModule from "../modules-ext/example/server.js";
import votingModule from "@ludiars/schedula-module-voting";
import holidayModule from "@ludiars/schedula-module-holiday";
import myplanModule from "@ludiars/schedula-module-myplan";
import smartSchedulerModule from "@ludiars/schedula-module-smart-scheduler";
import schoolModule from "@ludiars/schedula-module-school";
import integrationsModule from "@ludiars/schedula-module-integrations";

export function createApp() {
  const app = new Hono();

  // ─── WebSocket Handler (/ws) ───────────────────────────────
  const { injectWebSocket } = setupWebSocket(app);

  // ─── Global Error Handler ───────────────────────────────────
  app.onError((err, c) => {
    console.error(`[server] 未処理エラー: ${c.req.method} ${c.req.path}`, err);
    const isProduction = secretManager.get("NODE_ENV") === "production";
    return c.json({
      error: "Internal server error",
      ...(isProduction ? {} : { message: err.message }),
    }, 500);
  });

  // ─── Rate Limiting (テスト環境では無効) ─────────────────────
  // 認証 (login/register/refresh) は Cernere に委譲済み
  const isTestEnv = secretManager.getOrDefault("NODE_ENV", "") === "test"
    || typeof process !== "undefined" && process.env.VITEST === "true";
  if (!isTestEnv) {
    app.use("/api/setup/*", rateLimit({ maxRequests: 5, windowMs: 15 * 60 * 1000 }));
  }

  // ─── Global Middleware ──────────────────────────────────────
  // requestId を最初に付与して、以降のログ・レスポンスヘッダで使えるようにする
  app.use("*", requestId());

  // 構造化 access ログ — 全 HTTP request を [action] 形式で stdout に。
  // status>=400 は error として、status>=500 は err detail も併記する。
  app.use("*", async (c, next) => {
    const t0 = Date.now();
    let thrown: unknown = undefined;
    try {
      await next();
    } catch (err) {
      thrown = err;
      throw err;
    } finally {
      const status = c.res?.status ?? (thrown ? 500 : 0);
      const userId = (c.get("user" as never) as { id?: string } | undefined)?.id;
      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Date.now() - t0,
      };
      if (userId) entry.userId = userId;
      if (thrown) entry.error = thrown instanceof Error ? thrown.message : String(thrown);
      const tag = status >= 500 ? "[http-error]" : status >= 400 ? "[http-warn]" : "[http]";
      console.log(`${tag} ${JSON.stringify(entry)}`);
    }
  });

  app.use("*", cors({
    origin: secretManager.getOrDefault("CORS_ORIGIN",
      secretManager.getOrDefault("FRONTEND_URL", "http://localhost:8080")),
    credentials: true,
  }));

  // Security headers
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "1; mode=block");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-Permitted-Cross-Domain-Policies", "none");
    c.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (secretManager.get("NODE_ENV") === "production") {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  // ─── Setup Routes (認証不要: 初回セットアップ) ──────────────
  app.route("/api/setup", setupRoutes);

  // ─── Composite Auth (認証不要: ログイン前のユーザーが呼ぶ) ──
  app.route("/api/auth", compositeAuthRoutes);

  app.use("/api/*", userContext());

  // ─── Module Admin API (プラグインモジュール管理) ─────────────
  app.route("/api/admin", moduleAdminRoutes);

  // Issue #111 D1 / D3 / D4 — plugin 拡張 REST API
  app.route("/api/links",         issueLinkRoutes);
  app.route("/api/comments",      commentRoutes);
  app.route("/api/custom-fields", customFieldRoutes);

  // Issue #111 D10 — 外部パッケージの動的インストール
  dynamicInstallRoutes(app);

  // ─── Auth Routes (認証) — コア ──────────────────────────────
  app.route("/api/auth", auth);

  // ─── Core: Profile (プロフィール & プロジェクトロール) ────────
  app.route("/api/profile", profileRoutes);

  // ─── Core: Groups (グループ管理) ────────────────────────────
  app.route("/api/groups", groupRoutes);

  // ─── Core: Events (予定: 時間拘束のある未来の事象) ─────────
  app.route("/api/events", eventRoutes);

  // ─── Core: Tasks (タスク: 解決すべき現在の事象) ────────────
  app.route("/api/tasks", taskRoutes);

  // ─── Core: Calendar (Google Calendar + 手動予定 + プラン) ────
  app.route("/api/calendar", calendar);

  // ─── Module: Placement (GPS 場所登録 + enter/leave トリガー) ──
  // Imperativus が OwnTracks 経由で受信した位置を /api/placement/locations
  // に POST して、 ここで place 比較 + hook 発火する。
  app.route("/api/placement", placementRoutes);

  // ─── SDK module 経由: MyPlan / Smart-Scheduler / School / Integrations / Holiday / Voting ──

  // ─── Module: Webhooks & Notifications ───────────────────────
  app.route("/api/webhooks", notification);

  // ─── リマインダーは Nuntius に移行予定 (modules/reminder 撤去済) ─

  // ─── Module: External API (外部API連携) ─────────────────────
  app.route("/api/external", externalApi);

  // ─── PM (M2) — legacy ActioModule (SDK 移行未) ─────────────
  const legacyModules: ActioModule[] = [pmModule];
  for (const mod of legacyModules) {
    app.route(mod.basePath, mod.routes);
  }

  // ─── SDK-based plugin modules (Phase 1: 静的登録) ────────────
  // installModule() は Promise を返すが createApp() 内では await しない (同期構築)。
  // アプリ起動時に reject するとログに載る。manifest の REST 登録は Hono が
  // Promise で mount できるため遅延登録で問題ない。
  installModule(app, exampleModule, {
    packageName: "actio-example-module",
    packageVersion: "0.1.0",
  });
  installModule(app, votingModule, {
    packageName: "actio-voting-module",
    packageVersion: "0.1.0",
  });
  installModule(app, holidayModule, {
    packageName: "@ludiars/schedula-module-holiday",
    packageVersion: "0.1.0",
  });
  installModule(app, myplanModule, {
    packageName: "@ludiars/schedula-module-myplan",
    packageVersion: "0.1.0",
  });
  installModule(app, smartSchedulerModule, {
    packageName: "@ludiars/schedula-module-smart-scheduler",
    packageVersion: "0.1.0",
  });
  installModule(app, schoolModule, {
    packageName: "@ludiars/schedula-module-school",
    packageVersion: "0.1.0",
  });
  installModule(app, integrationsModule, {
    packageName: "@ludiars/schedula-module-integrations",
    packageVersion: "0.1.0",
  });

  // Cernere に userData カラムを同期 (fire-and-forget、CERNERE_URL 未設定なら no-op)
  void (async () => {
    const { syncProjectSchemaToCernere } = await import("./plugins/schema-sync.js");
    await syncProjectSchemaToCernere();
  })();

  // ─── Legacy Compatibility ───────────────────────────────────
  // /api/m1 は school SDK モジュールの /api/school/m1 に移行 (alias は別途必要なら module 内追加)
  app.route("/api/m5", notification);
  // /api/m6 は voting SDK モジュールに移行、/api/voting のみ提供

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
    for (const mod of legacyModules) {
      registeredModules[mod.name] = `${mod.description} - ${mod.basePath}`;
    }

    return c.json({
      name: "Actio",
      description: "プラグインベースの予定 (Event) & タスク (Task) 管理プラットフォーム",
      version: "1.0.0",
      core: {
        auth: "認証 - /api/auth",
        profile: "プロフィール & プロジェクトロール - /api/profile",
        groups: "グループ管理 - /api/groups",
        events: "予定 (時間拘束のある未来の事象) - /api/events",
        tasks: "タスク (解決すべき現在の事象) - /api/tasks",
        calendar: "カレンダー & 手動予定 - /api/calendar",
        myplans: "マイプラン - /api/myplans",
        smartScheduler: "自動配置スケジューラ - /api/smart-scheduler",
      },
      modules: {
        ...registeredModules,
        webhooks: "Webhook・リマインド通知 - /api/webhooks",
        voting: "日程調整Voting - /api/voting",
        integrations: "外部サービス連携 (Google Calendar同期・Notion) - /api/integrations",
        externalApi: "外部API連携 (カレンダー・リマインダー・予定設定) - /api/external",
      },
      eventPlugins: getEventPlugins().map((p) => ({
        id: p.id,
        name: p.name,
        path: p.frontendPath,
        managed: p.managed,
      })),
      taskPlugins: getTaskPlugins().map((p) => ({
        id: p.id,
        name: p.name,
        path: p.frontendPath,
        managed: p.managed,
      })),
      reservationPlugins: getReservationPlugins().map((p) => ({
        id: p.id,
        name: p.name,
        path: p.frontendPath,
      })),
    });
  });

  // ─── Liveness check (軽量) ────────────────────────────────
  // プロセスが生きているかだけを返す。k8s liveness probe 用。
  app.get("/api/health/live", (c) => {
    return c.json({
      status: "ok",
      service: "actio",
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Readiness check (DB / Redis 接続確認) ───────────────
  // 依存サービスの準備が整っているかチェック。k8s readiness probe 用。
  // 既存の /api/health は後方互換のため /api/ready のエイリアスとして残す。
  const readinessHandler = async (c: Context) => {
    const health: Record<string, unknown> = {
      status: "ok",
      service: "actio",
      timestamp: new Date().toISOString(),
    };

    // DB ヘルスチェック
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

    // Redis ヘルスチェック
    try {
      const { getRedis } = await import("./db/redis.js");
      const redis = getRedis();
      if (redis) {
        await redis.ping();
        health.redis_status = "connected";
      } else {
        health.redis_status = "not_configured";
      }
    } catch (err) {
      health.status = "degraded";
      health.redis_status = "disconnected";
      health.redis_error = err instanceof Error ? err.message : String(err);
    }

    const statusCode = health.status === "ok" ? 200 : 503;
    return c.json(health, statusCode);
  };

  app.get("/api/ready", readinessHandler);
  // 後方互換: 既存の /api/health もそのまま残す (中身は readiness)
  app.get("/api/health", readinessHandler);

  // ─── Notification 配信は Nuntius に完全移行済み ──────────────
  // 旧 initNotificationHandler はローカル EventBus 購読用だったが廃止。

  return { app, injectWebSocket };
}
