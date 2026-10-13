/**
 * actio-web の HTTP サーバ。Host 検査 → 中継 or 静的配信の振り分けだけを持つ。
 */
import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { WebServerConfig } from "./config.js";
import { isAllowedHost } from "./host-guard.js";
import { isProxiedPath, proxyHttp, proxyUpgrade } from "./proxy.js";
import { cacheControlOf, contentTypeOf, resolveStaticPath } from "./static-files.js";

function pathnameOf(req: IncomingMessage): string {
  return (req.url ?? "/").split("?")[0] || "/";
}

function forbidHost(res: ServerResponse, host: string | undefined): void {
  res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
  res.end(`Blocked request. This host (${JSON.stringify(host ?? "")}) is not allowed.`);
}

function serveStatic(req: IncomingMessage, res: ServerResponse, distDir: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }
  const resolved = resolveStaticPath(distDir, pathnameOf(req));
  if (!resolved) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  res.writeHead(200, {
    "content-type": contentTypeOf(resolved.file),
    "cache-control": cacheControlOf(distDir, resolved.file),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(resolved.file)
    .on("error", () => res.destroy())
    .pipe(res);
}

export function createWebServer(config: WebServerConfig): Server {
  const target = { backendUrl: config.backendUrl, changeOrigin: config.changeOrigin };
  const server = createServer((req, res) => {
    if (!isAllowedHost(req.headers.host, config.allowedHosts)) {
      forbidHost(res, req.headers.host);
      return;
    }
    if (isProxiedPath(pathnameOf(req))) proxyHttp(req, res, target);
    else serveStatic(req, res, config.distDir);
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isAllowedHost(req.headers.host, config.allowedHosts) || !isProxiedPath(pathnameOf(req))) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    proxyUpgrade(req, socket, head, target);
  });
  return server;
}
