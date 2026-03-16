import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { m1 } from "./modules/m1/routes.js";
import { m2 } from "./modules/m2/routes.js";
import { m3 } from "./modules/m3/routes.js";
import { m4 } from "./modules/m4/routes.js";
import { m5 } from "./modules/m5/routes.js";
import { auth } from "./auth/routes.js";
import { userContext } from "./middleware/auth.js";
import { initNotificationHandler } from "./modules/m5/notification-handler.js";
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "./shared/constants.js";

const app = new Hono();

// ─── Global Middleware ──────────────────────────────────────
app.use("*", cors());
app.use("*", logger());
app.use("/api/*", userContext());

// ─── Auth Routes (認証) ─────────────────────────────────────
app.route("/api/auth", auth);

// ─── Module Routes ──────────────────────────────────────────
app.route("/api/m1", m1);
app.route("/api/m2", m2);
app.route("/api/m3", m3);
app.route("/api/m4", m4);
app.route("/api/m5", m5);

// ─── Health & Info ──────────────────────────────────────────
app.get("/", (c) => {
  return c.json({
    name: "Schedula - Academic Scheduling System",
    version: "1.0.0",
    modules: {
      M1: "授業予定組立ツール - /api/m1",
      M2: "データ統合 - /api/m2",
      M3: "オートスケジューラ - /api/m3",
      M4: "予約システム - /api/m4",
      M5: "Webhook・リマインド通知 - /api/m5",
    },
  });
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

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

// ─── Initialize Notification Handler ────────────────────────
initNotificationHandler();

// ─── Server ─────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Schedula server running on http://localhost:${info.port}`);
});

export { app };
