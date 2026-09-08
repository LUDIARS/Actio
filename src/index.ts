import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { install as installVestigium } from "@ludiars/vestigium";
import { secretManager, initSecrets } from "./config/secrets.js";
import { createApp } from "./app.js";
import { initComposite } from "./auth/composite.js";
import { startPasetoVerify } from "./auth/paseto-verify.js";
import { localModeEnabled } from "./auth/local-mode.js";

installVestigium({
  serviceCode: "actio",
  captureConsole: true,
  pinoTransport: false,
});

// シークレチE��初期匁E(Infisical / env フォールバック)
await initSecrets();

const { app, injectWebSocket } = createApp();

// Add logger only for the server (not tests)
app.use("*", logger());

// ─── Server ─────────────────────────────────────────────────
const port = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);

console.log(`[server] 起動中... ポ�EチE${port}`);
console.log(`[server] FRONTEND_URL = ${secretManager.getOrDefault("FRONTEND_URL", "http://localhost:8080")}`);
console.log(`[server] GOOGLE_REDIRECT_URI = ${secretManager.getOrDefault("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/auth/google/callback")}`);
console.log(`[server] Infisical = ${secretManager.isInfisicalEnabled() ? "有効" : "無効 (環墁E��数フォールバック)"}`);
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
import { startTeamSyncTick } from "../modules/task/team/cc-sync.js";
startTeamSyncTick();

// ─── Peer Service Adapter (backend-to-backend WS via Cernere) ─
import { initServiceAdapter } from "./service-adapter.js";
void initServiceAdapter().catch((err) => {
  console.warn("[actio-sa] peer adapter 起動失敁E(user-facing API は継綁E:", err);
});

export { app };


