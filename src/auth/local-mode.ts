import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { secretManager } from "../config/secrets.js";
import { createCfAccessVerifier } from "./cf-access-verify.js";
import { allowsLocalRequest, cfAccessAssertion, readLocalMode, type LocalModeConfig } from "./local-mode-policy.js";

export const LOCAL_USER = Object.freeze({
  id: "actio-local", name: "Local user", email: "", role: "general",
});

/** loopback = この PC から直接、 cf-access = Cloudflare Access で認証済みのトンネル経由。 */
export type LocalAccessKind = "loopback" | "cf-access";

const LOCAL_ACCESS_KEY = "localAccess";

let deployment: LocalModeConfig | undefined;
let verifier: ReturnType<typeof createCfAccessVerifier> | undefined;
const loggedAccessEmails = new Set<string>();

function readDeployment(): LocalModeConfig {
  // Select only after initSecrets, then retain the listener's deployment policy.
  // Secret refresh must not turn a public listener into a local-mode listener.
  deployment ??= readLocalMode((key) => secretManager.get(key));
  return deployment;
}

export function localModeEnabled(): boolean {
  return readDeployment().enabled;
}

/** 経路を判定する。 Cloudflare 経由はアサーションの署名検証が済んだときだけ通す。 */
export async function resolveLocalAccess(c: Context): Promise<LocalAccessKind | null> {
  const config = readDeployment();
  if (!config.enabled) return null;
  // Non-Node callers have no trustworthy socket and must not gain local access.
  let peer: string | undefined;
  try { peer = getConnInfo(c).remote.address; }
  catch { return null; }
  if (allowsLocalRequest(peer, c.req.raw)) return "loopback";
  if (!config.cfAccess) return null;
  const assertion = cfAccessAssertion(peer, c.req.raw, config.cfAccess);
  if (!assertion) return null;
  verifier ??= createCfAccessVerifier(config.cfAccess);
  const identity = await verifier.verify(assertion);
  if (!identity) return null;
  const auditLabel = identity.email ?? "(no email: service token)";
  if (!loggedAccessEmails.has(auditLabel)) {
    // Audit who reached the local deployment through the tunnel, once per process; the email is not persisted.
    loggedAccessEmails.add(auditLabel);
    console.info(`[local-access] via=cf-access email=${auditLabel}`);
  }
  return "cf-access";
}

/** 境界 middleware が判定済みの経路。 境界を通っていない要求は常に null (fail closed)。 */
export function localAccessKind(c: Context): LocalAccessKind | null {
  const value = c.get(LOCAL_ACCESS_KEY as never) as unknown;
  return value === "loopback" || value === "cf-access" ? value : null;
}

export function isLocalModeRequest(c: Context): boolean {
  return localAccessKind(c) !== null;
}

/** Local mode never exposes the legacy anonymous routes to a proxy or LAN. */
export function localModeBoundary() {
  localModeEnabled(); // Validate deployment configuration while constructing the app.
  return createMiddleware(async (c, next) => {
    if (localModeEnabled()) {
      c.header("Cache-Control", "no-store");
      const access = await resolveLocalAccess(c);
      if (!access) return c.json({ error: "local_access_required" }, 403);
      c.set(LOCAL_ACCESS_KEY as never, access as never);
    }
    await next();
  });
}
