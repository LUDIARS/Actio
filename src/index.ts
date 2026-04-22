import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { secretManager, initSecrets } from "./config/secrets.js";
import { createApp } from "./app.js";
import { initComposite } from "./auth/composite.js";

// シークレット初期化 (Infisical / env フォールバック)
await initSecrets();

const { app, injectWebSocket } = createApp();

// Add logger only for the server (not tests)
app.use("*", logger());

// ─── Server ─────────────────────────────────────────────────
const port = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);

console.log(`[server] 起動中... ポート ${port}`);
console.log(`[server] FRONTEND_URL = ${secretManager.getOrDefault("FRONTEND_URL", "http://localhost:8080")}`);
console.log(`[server] GOOGLE_REDIRECT_URI = ${secretManager.getOrDefault("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/auth/google/callback")}`);
console.log(`[server] Infisical = ${secretManager.isInfisicalEnabled() ? "有効" : "無効 (環境変数フォールバック)"}`);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] Actio server running on http://localhost:${info.port}`);
});

// ─── WebSocket ──────────────────────────────────────────────
injectWebSocket(server);

// ─── Cernere Composite ──────────────────────────────────────
initComposite();

// ─── Peer Service Adapter (backend-to-backend WS via Cernere) ─
import { initServiceAdapter } from "./service-adapter.js";
void initServiceAdapter().catch((err) => {
  console.warn("[actio-sa] peer adapter 起動失敗 (user-facing API は継続):", err);
});

export { app };
