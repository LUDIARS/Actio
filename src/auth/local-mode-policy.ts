import { isIP } from "node:net";

/** Cloudflare Access 経由を通すための設定 (spec/feature/local-mode-cf-access.md §1)。 */
export interface CfAccessConfig {
  teamDomain: string;
  audiences: string[];
  allowedEmails: string[];
  publicOrigin: string;
  publicHost: string;
}

export interface LocalModeConfig {
  enabled: boolean;
  /** null は Cloudflare 経由を一切通さない (従来の loopback 限定)。 */
  cfAccess: CfAccessConfig | null;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  if (address === "::1") return true;
  const ipv4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  return isIP(ipv4) === 4 && ipv4.startsWith("127.");
}

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      && (hostname === "localhost" || isLoopbackAddress(hostname));
  } catch { return false; }
}

const TEAM_DOMAIN_PATTERN = /^[a-z0-9-]+\.cloudflareaccess\.com$/i;
const AUDIENCE_PATTERN = /^[A-Za-z0-9]+$/;

function splitList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

function readCfAccess(get: (key: string) => string | undefined): CfAccessConfig | null {
  const flag = get("ACTIO_CLOUDFLARE_ENABLED")?.trim();
  if (flag === undefined || flag === "" || flag === "0") return null;
  if (flag !== "1") throw new Error("ACTIO_CLOUDFLARE_ENABLED must be 0 or 1");

  const teamDomain = get("ACTIO_CF_ACCESS_TEAM_DOMAIN")?.trim() ?? "";
  if (!TEAM_DOMAIN_PATTERN.test(teamDomain)) {
    throw new Error("ACTIO_CF_ACCESS_TEAM_DOMAIN must be <team>.cloudflareaccess.com when Cloudflare is enabled in local mode");
  }
  const audiences = splitList(get("ACTIO_CF_ACCESS_AUD"));
  if (audiences.length === 0 || audiences.some((aud) => !AUDIENCE_PATTERN.test(aud))) {
    throw new Error("ACTIO_CF_ACCESS_AUD must list the Access application AUD tags when Cloudflare is enabled in local mode");
  }
  const allowedEmails = splitList(get("ACTIO_CF_ACCESS_ALLOWED_EMAILS")).map((email) => email.toLowerCase());
  if (allowedEmails.length === 0 || allowedEmails.some((email) => !email.includes("@"))) {
    throw new Error("ACTIO_CF_ACCESS_ALLOWED_EMAILS must list allowed email addresses when Cloudflare is enabled in local mode");
  }
  let origin: URL;
  try { origin = new URL(get("ACTIO_CF_PUBLIC_ORIGIN")?.trim() ?? ""); }
  catch { throw new Error("ACTIO_CF_PUBLIC_ORIGIN must be the public https origin when Cloudflare is enabled in local mode"); }
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password
    || isLocalUrl(origin.href)) {
    throw new Error("ACTIO_CF_PUBLIC_ORIGIN must be a public https origin without a path");
  }
  return { teamDomain: teamDomain.toLowerCase(), audiences, allowedEmails, publicOrigin: origin.origin, publicHost: origin.host.toLowerCase() };
}

/** Explicit local deployment; conflicting public/tunnel settings are errors. */
export function readLocalMode(get: (key: string) => string | undefined): LocalModeConfig {
  const mode = get("ACTIO_LOCAL_MODE")?.trim() || "0";
  if (mode !== "0" && mode !== "1") throw new Error("ACTIO_LOCAL_MODE must be 0 or 1");
  if (mode === "0") return { enabled: false, cfAccess: null };
  // The shared tunnel (Excubitor) owns cloudflared; Actio must never run its own tunnel.
  if (get("TUNNEL_TOKEN") || get("CLOUDFLARE_TUNNEL_TOKEN")) {
    throw new Error("Actio local mode must not run its own Cloudflare tunnel");
  }
  for (const key of ["ACTIO_PUBLIC_URL", "FRONTEND_URL"]) {
    const value = get(key);
    if (value && !isLocalUrl(value)) throw new Error(`${key} must be loopback in local mode`);
  }
  return { enabled: true, cfAccess: readCfAccess(get) };
}

/** Socket identity is authoritative; proxy headers can only disqualify access. */
export function allowsLocalRequest(peer: string | undefined, request: Request): boolean {
  if (!isLoopbackAddress(peer) || !isLocalUrl(request.url)) return false;
  const host = request.headers.get("host");
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host) || !isLocalUrl(`http://${host}`)) return false;
  for (const name of request.headers.keys()) {
    if (name.startsWith("cf-") || name.startsWith("x-forwarded-")
      || ["forwarded", "x-real-ip", "via", "true-client-ip"].includes(name)) return false;
  }
  const origin = request.headers.get("origin");
  if (origin !== null && !isLocalUrl(origin)) return false;
  return isSameOriginFetch(request);
}

/** Only a same-origin (or non-browser, header-absent) fetch may act as the local user. */
function isSameOriginFetch(request: Request): boolean {
  // "same-site" still permits another port/subdomain origin.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  return request.headers.get("sec-fetch-mode") !== "no-cors";
}

/**
 * Cloudflare Tunnel 経由の要求の形を確かめ、 検証すべきアサーションを返す (検証自体は cf-access-verify)。
 * 経路は同じ PC の cloudflared (ループバックのソケット) に限り、 Host / Origin は公開 origin に一致させる。
 */
export function cfAccessAssertion(peer: string | undefined, request: Request, config: CfAccessConfig): string | null {
  if (!isLoopbackAddress(peer)) return null;
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if (url.host.toLowerCase() !== config.publicHost) return null;
  if (request.headers.get("host")?.toLowerCase() !== config.publicHost) return null;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== config.publicOrigin) return null;
  if (!isSameOriginFetch(request)) return null;
  const assertion = request.headers.get("cf-access-jwt-assertion")?.trim();
  return assertion ? assertion : null;
}
