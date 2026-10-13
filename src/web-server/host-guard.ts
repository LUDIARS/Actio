/**
 * Host ヘッダの検査。vite preview の allowedHosts と同じく、loopback・IP 直指定・
 * 設定した公開 host だけを受け付け、DNS rebinding 経由の要求を 403 にする。
 */
import { isIP } from "node:net";
import { contract } from '../contract-runtime.js'; /* augur-inject:import:2ab75efe */
import augurContract_ff0084c0 from '../../contracts/web-host-guard.contract.ts'; /* augur-inject:contract-predicate:6fdff1f5 */

/** "host:port" / "[::1]:port" から host 名だけを取り出す。 */
export function hostnameOf(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) return trimmed.slice(1, trimmed.indexOf("]"));
  return trimmed.replace(/:\d+$/, "");
}

export function isAllowedHost(host: string | undefined, allowed: readonly string[]): boolean {
  if (!host) return false;
  const name = hostnameOf(host);
  if (!name) return false;
  if (name === "localhost" || name.endsWith(".localhost") || isIP(name) !== 0) return true;
  return allowed.some((h) => h.toLowerCase() === name);
}
// @ts-expect-error augur-inject
isAllowedHost = contract(isAllowedHost, { ...augurContract_ff0084c0, contractId: 'C-10', mode: 'observe', sample: 1, where: 'src/web-server/host-guard.ts:14', rule: 'contract-wrap', id: 'ff0084c0' }); /* augur-inject:contract-wrap:ff0084c0 */
