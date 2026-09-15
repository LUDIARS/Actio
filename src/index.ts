import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { install as installVestigium } from "@ludiars/vestigium";
import { secretManager, initSecrets } from "./config/secrets.js";
import { resolveBackendPort } from "./config/service-endpoints.js";

installVestigium({
  serviceCode: "actio",
  captureConsole: true,
  pinoTransport: false,
});

// Load injected secrets and encrypted local settings before application imports.
await initSecrets();
const port = resolveBackendPort();

const { localModeEnabled } = await import("./auth/local-mode.js");
localModeEnabled();
secretManager.getRequired("FRONTEND_URL");
if (!localModeEnabled()) secretManager.getRequired("JWT_SECRET");
const { createApp } = await import("./app.js");
const { initComposite } = await import("./auth/composite.js");
const { startPasetoVerify } = await import("./auth/paseto-verify.js");
const { startTeamSyncTick } = await import("../modules/task/team/cc-sync.js");
const { startNotificationTick } = await import("../modules/task/notifications/tick.js");
const { initServiceAdapter } = await import("./service-adapter.js");

const { app, injectWebSocket } = createApp();

// Add logger only for the server (not tests)
app.use("*", logger());

// ─── Server ─────────────────────────────────────────────────


console.log(`[server] Starting on port ${port}`);
console.log(`[server] Secret provider: ${secretManager.getProviderType()}`);
const server = serve({ fetch: app.fetch, port, ...(localModeEnabled() ? { hostname: "127.0.0.1" } : {}) }, (info) => {
  console.log(`[server] Actio server running on http://localhost:${info.port}`);
});

// ─── WebSocket ──────────────────────────────────────────────
injectWebSocket(server);

// ─── Cernere Composite ──────────────────────────────────────
initComposite();

// ─── Cernere PASETO V4 verify (Hub 経由の user_for_project token 受理) ─
startPasetoVerify({
  cernereBaseUrl: secretManager.getOrDefault("CERNERE_URL", ""),
  audience: secretManager.getOrDefault(
    "ACTIO_PUBLIC_URL",
    `http://localhost:${port}`,
  ),
});

// ─── Cc チーム同期 (起動時 + 10 分 tick, team-task §8.2) ──────
startTeamSyncTick();

// ─── タスク通知 (期限前検出 + 送信箱の配送, 1 分 tick, task-integration §2.3) ─
startNotificationTick();

// ─── Peer Service Adapter (backend-to-backend WS via Cernere) ─
void initServiceAdapter().catch((err) => {
  console.warn("[actio-sa] peer adapter 起動失敁E(user-facing API は継綁E:", err);
});

export { app };


