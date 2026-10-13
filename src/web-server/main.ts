/**
 * actio-web の起動口 (`node dist/src/web-server/main.js`)。
 * vite preview の代わりに frontend/dist を配信し、/api・/ws・/.well-known を actio へ中継する。
 * 常駐プロセスは事前コンパイルした JS だけで起動する (AIFormat RULE_TECH_STACK.md「常駐プロセスの起動形」)。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadWebServerConfig } from "./config.js";
import { createWebServer } from "./server.js";

const config = loadWebServerConfig(process.env, import.meta.url);
const indexHtml = join(config.distDir, "index.html");
if (!existsSync(indexHtml)) {
  console.error(`[actio-web] ${indexHtml} が無い。frontend を build してから起動する。`);
  process.exit(1);
}

const server = createWebServer(config);
server.on("error", (err) => {
  console.error(`[actio-web] listen failed: ${(err as Error).message}`);
  process.exit(1);
});
server.listen(config.port, config.host, () => {
  console.log(`[actio-web] serving ${config.distDir} on http://${config.host}:${config.port} -> ${config.backendUrl.origin}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
