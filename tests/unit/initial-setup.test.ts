import { describe, expect, it, vi } from "vitest";
import { createSetupApp, SetupSaveError, type SetupAppDeps } from "../../src/setup/setup-app.js";
import { configKeyAvailable, missingStartupSettings, parseSetupInput, setupScreenAllowed } from "../../src/setup/setup-state.js";

describe("initial setup state", () => {
  it("asks for a database URL only when a URL dialect has none", () => {
    const from = (values: Record<string, string>) => (key: string) => values[key];
    expect(missingStartupSettings(from({}))).toEqual(["DATABASE_URL"]);
    expect(missingStartupSettings(from({ DB_DIALECT: "mysql", DATABASE_URL: " " }))).toEqual(["DATABASE_URL"]);
    expect(missingStartupSettings(from({ DATABASE_URL: "postgresql://db.invalid/actio" }))).toEqual([]);
    expect(missingStartupSettings(from({ DB_DIALECT: "sqlite" }))).toEqual([]);
  });

  it("opens only for an explicit local deployment with an injected key", () => {
    expect(setupScreenAllowed({ ACTIO_LOCAL_MODE: "1" })).toBe(true);
    expect(setupScreenAllowed({})).toBe(false);
    expect(configKeyAvailable({ ACTIO_CONFIG_KEY: "short" })).toBe(false);
    expect(configKeyAvailable({ ACTIO_CONFIG_KEY: "k".repeat(32) })).toBe(true);
  });

  it("accepts connection settings and rejects secrets or malformed URLs", () => {
    expect(parseSetupInput({ DATABASE_URL: " postgresql://db.invalid/actio ", REDIS_URL: "" }))
      .toEqual({ ok: true, settings: { DATABASE_URL: "postgresql://db.invalid/actio" }, usesSecretSource: false });
    expect(parseSetupInput({ DB_DIALECT: "sqlite", DATABASE_PATH: "data/actio.db" }).ok).toBe(true);
    expect(parseSetupInput({ DATABASE_URL: "postgresql://db.invalid/actio", JWT_SECRET: "x" }).ok).toBe(false);
    expect(parseSetupInput({ DATABASE_URL: "https://db.invalid/actio" }).ok).toBe(false);
    expect(parseSetupInput({ DB_DIALECT: "mysql", DATABASE_URL: "postgresql://db.invalid/actio" }).ok).toBe(false);
    expect(parseSetupInput({ DATABASE_URL: "postgresql://db.invalid/actio", REDIS_URL: "http://cache.invalid" }).ok).toBe(false);
    expect(parseSetupInput({}).ok).toBe(false);
    expect(parseSetupInput(null).ok).toBe(false);
  });

  it("accepts a secret source instead of a database URL and normalizes its key list", () => {
    const parsed = parseSetupInput({ ACTIO_SECRET_PROJECT_ID: "11111111-2222-3333-4444-555555555555", ACTIO_SECRET_ENVIRONMENT: "dev", ACTIO_SECRET_KEYS: "DATABASE_URL\nJWT_SECRET, DATABASE_URL" });
    expect(parsed).toMatchObject({ ok: true, usesSecretSource: true, settings: { ACTIO_SECRET_KEYS: "DATABASE_URL,JWT_SECRET" } });
    // A pointer without keys, or one that tries to pull a deployment setting, is refused.
    expect(parseSetupInput({ ACTIO_SECRET_PROJECT_ID: "11111111-2222-3333-4444-555555555555", ACTIO_SECRET_ENVIRONMENT: "dev" }).ok).toBe(false);
    expect(parseSetupInput({ ACTIO_SECRET_PROJECT_ID: "11111111-2222-3333-4444-555555555555", ACTIO_SECRET_ENVIRONMENT: "dev", ACTIO_SECRET_KEYS: "FRONTEND_URL" }).ok).toBe(false);
    expect(parseSetupInput({ ACTIO_SECRET_PROJECT_ID: "bad id", ACTIO_SECRET_ENVIRONMENT: "dev", ACTIO_SECRET_KEYS: "DATABASE_URL" }).ok).toBe(false);
  });
});

describe("initial setup app", () => {
  function build(overrides: Partial<SetupAppDeps> = {}) {
    const deps: SetupAppDeps = {
      missing: () => ["DATABASE_URL"], canEncrypt: () => true, save: vi.fn(async () => undefined), onConfigured: vi.fn(),
      isDirectLocalRequest: () => true, ...overrides,
    };
    return { app: createSetupApp(deps), deps };
  }
  const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("reports an unconfigured service as unhealthy and everything else as unavailable", async () => {
    const { app } = build();
    const health = await app.request("/api/health");
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({ status: "needs_setup", service: "actio" });
    expect((await app.request("/api/tasks")).status).toBe(503);
  });

  it("saves validated settings from this PC and then hands over to the application", async () => {
    const { app, deps } = build();
    const response = await app.request("/api/setup/local-config", post({ DATABASE_URL: "postgresql://db.invalid/actio" }));
    expect(response.status).toBe(200);
    expect(deps.save).toHaveBeenCalledWith({ DATABASE_URL: "postgresql://db.invalid/actio" });
    expect(deps.onConfigured).toHaveBeenCalledOnce();
  });

  it("never saves for a request that is not a direct local one", async () => {
    // Without an injected check the app reads the socket, which app.request() does not have.
    const { app, deps } = build({ isDirectLocalRequest: undefined });
    const status = await (await app.request("/api/setup/status")).json();
    expect(status).toMatchObject({ needsSetup: true, canSave: false, saveBlockedReason: "not_local" });
    expect((await app.request("/api/setup/local-config", post({ DATABASE_URL: "postgresql://db.invalid/actio" }))).status).toBe(403);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("refuses to save without the encryption key, on bad input, or when the write fails", async () => {
    const noKey = build({ canEncrypt: () => false });
    expect((await noKey.app.request("/api/setup/local-config", post({ DATABASE_URL: "postgresql://db.invalid/actio" }))).status).toBe(409);

    const bad = build();
    expect((await bad.app.request("/api/setup/local-config", post({ JWT_SECRET: "x" }))).status).toBe(400);
    expect(bad.deps.save).not.toHaveBeenCalled();

    const unmapped = build({ save: async () => { throw new SetupSaveError("secret_no_mapping", 409); } });
    const refused = await unmapped.app.request("/api/setup/local-config", post({ DATABASE_URL: "postgresql://db.invalid/actio" }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "secret_no_mapping" });
    expect(unmapped.deps.onConfigured).not.toHaveBeenCalled();

    const failing = build({ save: async () => { throw new Error("postgresql://user:password@db.invalid"); } });
    const failed = await failing.app.request("/api/setup/local-config", post({ DATABASE_URL: "postgresql://db.invalid/actio" }));
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("password");
    expect(failing.deps.onConfigured).not.toHaveBeenCalled();
  });
});
