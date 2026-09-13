import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyLocalConfig, readLocalConfig, writeLocalConfig } from "../../src/config/local-config.js";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "actio-config-test-"));
  vi.stubEnv("ACTIO_CONFIG_PATH", join(directory, "config.enc"));
  vi.stubEnv("ACTIO_CONFIG_KEY", "test-only-random-key-with-at-least-32-bytes");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("keeps Japanese settings encrypted and round-trips them", () => {
  const settings = { DATABASE_PATH: "データ/タスク.sqlite", DB_DIALECT: "postgres" };
  writeLocalConfig(settings);
  expect(readLocalConfig()).toEqual(settings);
  expect(readFileSync(process.env.ACTIO_CONFIG_PATH!, "utf8")).not.toContain("データ");
});
it("retains explicit injected values including empty strings", () => {
  writeLocalConfig({ REDIS_URL: "redis://stored.invalid", FRONTEND_URL: "http://stored.invalid" });
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("FRONTEND_URL", "http://injected.invalid");
  applyLocalConfig();
  expect(process.env.REDIS_URL).toBe("");
  expect(process.env.FRONTEND_URL).toBe("http://injected.invalid");
});
it("rejects a wrong key, corrupted config and credential keys", () => {
  expect(() => writeLocalConfig({ JWT_SECRET: "do-not-store-here" })).toThrow();
  writeLocalConfig({ DB_DIALECT: "postgres" });
  vi.stubEnv("ACTIO_CONFIG_KEY", "different-key-with-at-least-32-bytes");
  expect(() => readLocalConfig()).toThrow("Cannot read");
  writeFileSync(process.env.ACTIO_CONFIG_PATH!, "not encrypted", "utf8");
  expect(() => readLocalConfig()).toThrow("Cannot read");
});
