import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), ssm: vi.fn() }));
vi.mock("../../src/config/local-config.js", () => ({ applyLocalConfig: vi.fn(), LOCAL_SETTING_KEYS: new Set(["FRONTEND_URL"]) }));
vi.mock("../../src/config/service-endpoints.js", () => ({ applyExcubitorEndpoints: vi.fn() }));
vi.mock("../../src/config/excubitor/service-config.js", () => ({ applyExcubitorServiceConfig: vi.fn() }));
vi.mock("../../src/config/excubitor/secret-agent-client.js", () => ({ resolveSecretsFromExcubitor: mocks.resolve }));
vi.mock("../../src/config/ssm.js", () => ({ createSsmClient: mocks.ssm }));
import { secretManager } from "../../src/config/secrets.js";
beforeEach(() => {
  vi.stubEnv("SECRETS_PROVIDER", "env");
  vi.stubEnv("ACTIO_SECRET_KEYS", "JWT_SECRET");
  vi.stubEnv("JWT_SECRET", undefined);
  mocks.resolve.mockReset().mockResolvedValue(new Map([["JWT_SECRET", "vault-value"]]));
  mocks.ssm.mockReset();
});
afterEach(() => { secretManager.destroy(); vi.unstubAllEnvs(); });
it("loads Vault with keys only and preserves injected value precedence", async () => {
  await secretManager.reinit();
  expect(mocks.resolve).toHaveBeenCalledWith({ keys: ["JWT_SECRET"] });
  expect(secretManager.get("JWT_SECRET")).toBe("vault-value");
  expect(process.env.JWT_SECRET).toBeUndefined();
  vi.stubEnv("JWT_SECRET", "injected-value");
  expect(secretManager.get("JWT_SECRET")).toBe("injected-value");
  expect(mocks.ssm).not.toHaveBeenCalled();
});
it("refreshes the Vault subset and removes values no longer returned", async () => {
  await secretManager.reinit();
  mocks.resolve.mockResolvedValueOnce(new Map());
  await secretManager.refresh();
  expect(secretManager.get("JWT_SECRET")).toBeUndefined();
});
it("retains the previous cache when Vault refresh fails", async () => {
  await secretManager.reinit();
  mocks.resolve.mockRejectedValueOnce(new Error("fetch failed"));
  await expect(secretManager.refresh()).rejects.toThrow("fetch failed");
  expect(secretManager.get("JWT_SECRET")).toBe("vault-value");
});
it("rejects the removed Infisical provider without remote calls", async () => {
  vi.stubEnv("SECRETS_PROVIDER", "infisical");
  await expect(secretManager.reinit()).rejects.toThrow("Invalid SECRETS_PROVIDER");
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.ssm).not.toHaveBeenCalled();
});
