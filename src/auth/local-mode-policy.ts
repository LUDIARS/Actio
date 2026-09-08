import { isIP } from "node:net";

export interface LocalModeConfig { enabled: boolean }

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

/** Explicit local deployment; conflicting public/tunnel settings are errors. */
export function readLocalMode(get: (key: string) => string | undefined): LocalModeConfig {
  const mode = get("ACTIO_LOCAL_MODE")?.trim() || "0";
  if (mode !== "0" && mode !== "1") throw new Error("ACTIO_LOCAL_MODE must be 0 or 1");
  if (mode === "0") return { enabled: false };
  if (![undefined, "", "0"].includes(get("ACTIO_CLOUDFLARE_ENABLED")?.trim())
    || get("TUNNEL_TOKEN") || get("CLOUDFLARE_TUNNEL_TOKEN")) {
    throw new Error("Actio local mode cannot be used with Cloudflare");
  }
  for (const key of ["ACTIO_PUBLIC_URL", "FRONTEND_URL"]) {
    const value = get(key);
    if (value && !isLocalUrl(value)) throw new Error(`${key} must be loopback in local mode`);
  }
  return { enabled: true };
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
  // Only a same-origin (or non-browser, header-absent) fetch may act as the
  // local user. "same-site" still permits another port/subdomain origin.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  if (request.headers.get("sec-fetch-mode") === "no-cors") return false;
  return true;
}
