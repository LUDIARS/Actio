import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExcubitorUnavailableError } from "../../src/config/excubitor/endpoint.js";
import { resolveSecretsFromExcubitor, SecretAgentError } from "../../src/config/excubitor/secret-agent-client.js";
import { readSecretSource } from "../../src/config/secret-source.js";

const source = { projectId: "11111111-2222-3333-4444-555555555555", environment: "dev", keys: ["DATABASE_URL", "JWT_SECRET"] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("EXCUBITOR_URL", "http://excubitor.invalid/");
  vi.stubEnv("EXCUBITOR_AGENT_TOKEN", "test-agent-token");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("asks Excubitor for the actio mapping and keeps only the requested keys in memory", async () => {
  const fetchMock = vi.fn(async () => json({
    secrets: { DATABASE_URL: "postgresql://db.invalid/actio", UNREQUESTED: "x", JWT_SECRET: 42 },
    project_id: source.projectId, environment: "dev",
  }));
  vi.stubGlobal("fetch", fetchMock);

  const secrets = await resolveSecretsFromExcubitor(source);
  expect([...secrets]).toEqual([["DATABASE_URL", "postgresql://db.invalid/actio"]]);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://excubitor.invalid/api/v1/secrets/resolve");
  expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-agent-token");
  expect(JSON.parse(init.body as string)).toEqual({ service: "actio", keys: source.keys });
});

it("refuses values from a project or environment it was not configured for", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ secrets: { DATABASE_URL: "x" }, project_id: "another-project-id", environment: "dev" })));
  await expect(resolveSecretsFromExcubitor(source)).rejects.toMatchObject({ code: "source_mismatch" });
});

it("classifies agent failures without repeating the upstream message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ error: "no_mapping", message: "token=leaked" }, 404)));
  const failure = await resolveSecretsFromExcubitor(source).catch((err: unknown) => err);
  expect(failure).toBeInstanceOf(SecretAgentError);
  expect((failure as SecretAgentError).code).toBe("no_mapping");
  expect((failure as SecretAgentError).message).not.toContain("leaked");
});

it("fails fast when Excubitor did not inject its location or cannot be reached", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
  await expect(resolveSecretsFromExcubitor(source)).rejects.toMatchObject({ code: "unreachable" });
  vi.stubEnv("EXCUBITOR_URL", "");
  await expect(resolveSecretsFromExcubitor(source)).rejects.toBeInstanceOf(ExcubitorUnavailableError);
});

it("reads the stored source and stops on a corrupted one", () => {
  expect(readSecretSource({})).toBeNull();
  expect(readSecretSource({ ACTIO_SECRET_PROJECT_ID: source.projectId, ACTIO_SECRET_ENVIRONMENT: "dev", ACTIO_SECRET_KEYS: "DATABASE_URL,JWT_SECRET" })).toEqual(source);
  expect(() => readSecretSource({ ACTIO_SECRET_PROJECT_ID: source.projectId, ACTIO_SECRET_ENVIRONMENT: "dev", ACTIO_SECRET_KEYS: "" })).toThrow("Invalid secret source");
});
