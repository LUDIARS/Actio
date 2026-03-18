import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { createApp } from "./app.js";

const app = createApp();

// Add logger only for the server (not tests)
app.use("*", logger());

// ─── Server ─────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);

console.log(`[server] 起動中... ポート ${port}`);
console.log(`[server] FRONTEND_URL = ${process.env.FRONTEND_URL || "http://localhost:8080"}`);
console.log(`[server] GOOGLE_REDIRECT_URI = ${process.env.GOOGLE_REDIRECT_URI || "http://localhost:8080/api/auth/google/callback"}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] Schedula server running on http://localhost:${info.port}`);
});

export { app };
