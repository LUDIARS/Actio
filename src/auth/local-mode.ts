import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { secretManager } from "../config/secrets.js";
import { allowsLocalRequest, readLocalMode, type LocalModeConfig } from "./local-mode-policy.js";

export const LOCAL_USER = Object.freeze({
  id: "actio-local", name: "Local user", email: "", role: "general",
});

let deployment: LocalModeConfig | undefined;

export function localModeEnabled(): boolean {
  // Select only after initSecrets, then retain the listener's deployment policy.
  // Secret refresh must not turn a public listener into a local-mode listener.
  deployment ??= readLocalMode((key) => secretManager.get(key));
  return deployment.enabled;
}

export function isLocalModeRequest(c: Context): boolean {
  if (!localModeEnabled()) return false;
  // Non-Node callers have no trustworthy socket and must not gain local access.
  let peer: string | undefined;
  try { peer = getConnInfo(c).remote.address; }
  catch { return false; }
  return allowsLocalRequest(peer, c.req.raw);
}

/** Local mode never exposes the legacy anonymous routes to a proxy or LAN. */
export function localModeBoundary() {
  localModeEnabled(); // Validate deployment configuration while constructing the app.
  return createMiddleware(async (c, next) => {
    if (localModeEnabled()) {
      c.header("Cache-Control", "no-store");
      if (!isLocalModeRequest(c)) return c.json({ error: "local_access_required" }, 403);
    }
    await next();
  });
}
