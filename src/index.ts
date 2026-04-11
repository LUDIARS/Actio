import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { secretManager, initSecrets } from "./config/secrets.js";
import { createApp } from "./app.js";
import { initCernereBridge } from "./ws/cernere-bridge.js";
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
  console.log(`[server] Schedula server running on http://localhost:${info.port}`);
});

// ─── WebSocket ──────────────────────────────────────────────
injectWebSocket(server);

// ─── Cernere Composite (プロジェクト認証) ────────────────────
initComposite();

// ─── Cernere Service Bridge (セッション一本化) ───────────────
initCernereBridge();

export { app };
