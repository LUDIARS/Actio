import { expect, it, vi } from "vitest";
import type { MiddlewareHandler } from "hono";
vi.mock("../../src/middleware/auth.js", () => ({ requireRole: (): MiddlewareHandler => async (_c, next) => { await next(); } }));
vi.mock("../../src/config/secrets.js", () => ({ secretManager: {
  isExternalProviderEnabled: () => true, isSsmEnabled: () => false, getProviderType: () => "env",
  listKeys: () => [{ key: "JWT_SECRET", scope: "shared", hasValue: true }],
} }));
import { secretsRoutes } from "../../modules/secrets/routes.js";
it.each(["PUT", "DELETE"])("retires %s secret writes without reading secret payloads", async method => {
  const response = await secretsRoutes.request("/JWT_SECRET", { method, body: "private-value" });
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: "secret_writes_removed" });
});
it("reports a configured Vault source while preserving legacy status fields", async () => {
  const response = await secretsRoutes.request("/status");
  expect(await response.json()).toMatchObject({ externalProviderEnabled: true, infisicalEnabled: false, cachedSecretCount: 1 });
});
