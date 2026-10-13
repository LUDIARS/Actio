/**
 * actio 本体への中継。ビルド済み frontend は same-origin の /api・/ws・/.well-known を
 * 叩くため、vite preview の proxy と同じ 3 経路を backend へ渡す (WebSocket は /ws)。
 */
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as netConnect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { connect as tlsConnect } from "node:tls";
import { contract } from '../contract-runtime.js'; /* augur-inject:import:2db07294 */
import augurContract_77341b4c from '../../contracts/web-proxy-route.contract.ts'; /* augur-inject:contract-predicate:baa045ff */

const PROXIED = /^\/(api|ws|\.well-known)(\/|$|\?)/;

export function isProxiedPath(pathname: string): boolean {
  return PROXIED.test(pathname);
}
// @ts-expect-error augur-inject
isProxiedPath = contract(isProxiedPath, { ...augurContract_77341b4c, contractId: 'C-11', mode: 'observe', sample: 1, where: 'src/web-server/proxy.ts:13', rule: 'contract-wrap', id: '77341b4c' }); /* augur-inject:contract-wrap:77341b4c */

export interface ProxyTarget {
  readonly backendUrl: URL;
  readonly changeOrigin: boolean;
}

const QUIET_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE"]);

function logProxyError(err: NodeJS.ErrnoException): void {
  if (err.code && QUIET_CODES.has(err.code)) console.warn(`[web-proxy] ${err.code}: ${err.message}`);
  else console.error("[web-proxy] error:", err);
}

function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

export function forwardHeaders(headers: IncomingHttpHeaders, target: ProxyTarget): IncomingHttpHeaders {
  const next = { ...headers };
  if (target.changeOrigin) next.host = target.backendUrl.host;
  return next;
}

export function proxyHttp(req: IncomingMessage, res: ServerResponse, target: ProxyTarget): void {
  const { backendUrl } = target;
  const send = backendUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(
    {
      protocol: backendUrl.protocol,
      hostname: backendUrl.hostname,
      port: portOf(backendUrl),
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req.headers, target),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (err: NodeJS.ErrnoException) => {
    logProxyError(err);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad Gateway");
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

function upgradeRequestHead(req: IncomingMessage, target: ProxyTarget): string {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  for (const [name, value] of Object.entries(forwardHeaders(req.headers, target))) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

/** Upgrade 要求を生の TCP で backend へ渡し、以後は双方向に流す。 */
export function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, target: ProxyTarget): void {
  const { backendUrl } = target;
  const port = portOf(backendUrl);
  const onConnect = (): void => {
    upstream.write(upgradeRequestHead(req, target));
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  };
  const upstream: Socket = backendUrl.protocol === "https:"
    ? tlsConnect({ host: backendUrl.hostname, port, servername: backendUrl.hostname }, onConnect)
    : netConnect({ host: backendUrl.hostname, port }, onConnect);
  const close = (err?: NodeJS.ErrnoException): void => {
    if (err) logProxyError(err);
    upstream.destroy();
    socket.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
  upstream.on("close", () => socket.destroy());
  socket.on("close", () => upstream.destroy());
}
