import { Hono } from "hono";
import { secretManager } from "../../src/config/secrets.js";

/** Startup configuration is owned by Excubitor and the encrypted local file. */
export const setupRoutes = new Hono();
setupRoutes.get("/status", c => c.json({
  needsSetup: false, infisicalConfigured: secretManager.isInfisicalEnabled(),
  ssmConfigured: secretManager.isSsmEnabled(), providerType: secretManager.getProviderType(),
  setupSkipped: false, configurationMode: "excubitor",
}));
// Explicitly retire unauthenticated credential writes, remote probes and .env mutation.
setupRoutes.all("/*", c => c.json({ error: "設定は暗号化configとExcubitorで管理してください。旧セットアップAPIは廃止しました。" }, 410));
