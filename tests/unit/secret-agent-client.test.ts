import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExcubitorUnavailableError } from "../../src/config/excubitor/endpoint.js";
import { resolveSecretsFromExcubitor, SecretAgentError } from "../../src/config/excubitor/secret-agent-client.js";
import { parseSecretSource, readSecretSource, secretSourceSettings } from "../../src/config/secret-source.js";
import { LOCAL_SETTING_KEYS } from "../../src/config/local-config.js";

const source = { keys: ["DATABASE_URL", "JWT_SECRET"] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.stubEnv("EXCUBITOR_URL", "http://excubitor.invalid/");
  vi.stubEnv("EXCUBITOR_AGENT_TOKEN", "test-agent-token");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("accepts a Vault subset with null coordinates and keeps values in memory", async () => {
  vi.stubEnv("DATABASE_URL", "injected-value");
  const fetchMock = vi.fn(async () => json({ secrets: { DATABASE_URL: "vault-value" }, source: "vault", project_id: null, environment: null }));
  vi.stubGlobal("fetch", fetchMock);
  expect([...await resolveSecretsFromExcubitor(source)]).toEqual([["DATABASE_URL", "vault-value"]]);
  expect(process.env.DATABASE_URL).toBe("injected-value");
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://excubitor.invalid/api/v1/secrets/resolve");
  expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-agent-token");
  expect(JSON.parse(init.body as string)).toEqual({ service: "actio", keys: source.keys });
});
it("accepts an empty Vault subset", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ secrets: {}, source: "vault" })));
  expect((await resolveSecretsFromExcubitor(source)).size).toBe(0);
});
it.each([undefined, "infisical", null])("refuses non-Vault source %s", async (upstreamSource) => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ secrets: {}, source: upstreamSource })));
  await expect(resolveSecretsFromExcubitor(source)).rejects.toMatchObject({ code: "source_mismatch" });
});
it.each([null, [], "secret", 42, { UNREQUESTED: "private-value" }, { JWT_SECRET: 42 }])("rejects invalid secrets as a whole: %j", async (secrets) => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ secrets, source: "vault" })));
  await expect(resolveSecretsFromExcubitor(source)).rejects.toMatchObject({ code: "bad_response" });
});
it("rejects malformed JSON", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid-json")));
  await expect(resolveSecretsFromExcubitor(source)).rejects.toMatchObject({ code: "bad_response" });
});
it.each([[401, "unauthorized"], [403, "key_not_allowed"], [404, "no_mapping"], [502, "fetch_failed"], [503, "no_identity"]] as const)("classifies HTTP %s without exposing its body", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ message: "private-upstream-value" }, status)));
  const failure = await resolveSecretsFromExcubitor(source).catch((err: unknown) => err);
  expect(failure).toBeInstanceOf(SecretAgentError);
  expect(failure).toMatchObject({ code });
  expect((failure as Error).message).not.toContain("private-upstream-value");
});
it("rejects local keys before fetching", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  for (const key of LOCAL_SETTING_KEYS) {
    expect(parseSecretSource(key).ok).toBe(false);
    await expect(resolveSecretsFromExcubitor({ keys: [key] })).rejects.toMatchObject({ code: "key_not_allowed" });
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
it("fails fast for an unreachable or missing Excubitor endpoint", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
  await expect(resolveSecretsFromExcubitor(source)).rejects.toMatchObject({ code: "unreachable" });
  vi.stubEnv("EXCUBITOR_URL", "");
  await expect(resolveSecretsFromExcubitor(source)).rejects.toBeInstanceOf(ExcubitorUnavailableError);
});
it("uses only key selection, normalizes duplicates, and ignores legacy coordinates", () => {
  expect(readSecretSource({})).toBeNull();
  expect(readSecretSource({ ACTIO_SECRET_KEYS: "" })).toBeNull();
  expect(readSecretSource({ ACTIO_SECRET_KEYS: "DATABASE_URL,JWT_SECRET DATABASE_URL" })).toEqual(source);
  expect(readSecretSource({ ACTIO_SECRET_PROJECT_ID: "legacy", ACTIO_SECRET_ENVIRONMENT: "legacy", ACTIO_SECRET_KEYS: "DATABASE_URL,JWT_SECRET" })).toEqual(source);
  expect(secretSourceSettings(source)).toEqual({ ACTIO_SECRET_KEYS: "DATABASE_URL,JWT_SECRET" });
  expect(() => readSecretSource({ ACTIO_SECRET_KEYS: "invalid-key" })).toThrow("Invalid secret source");
  expect(parseSecretSource("").ok).toBe(false);
  expect(parseSecretSource(Array.from({ length: 65 }, (_, i) => "KEY_" + i).join(",")).ok).toBe(false);
});
