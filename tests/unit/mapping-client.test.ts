import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MappingRegistrationError, registerSecretSourceWithExcubitor } from "../../src/config/excubitor/mapping-client.js";

const source = { projectId: "11111111-2222-3333-4444-555555555555", environment: "dev", keys: ["DATABASE_URL", "JWT_SECRET"] };

beforeEach(() => vi.stubEnv("EXCUBITOR_URL", "http://excubitor.invalid"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("writes only the actio row through the per-service route with injection off", async () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await registerSecretSourceWithExcubitor(source);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://excubitor.invalid/api/v1/config/infisical/services/actio");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body as string)).toEqual({
    project_id: source.projectId, environment: "dev", inject: false, prefix: "", include: source.keys,
  });
});

it("tells an old Excubitor apart from a rejected or failed write", async () => {
  for (const [status, code] of [[404, "unsupported"], [400, "rejected"], [500, "failed"]] as const) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    const failure = await registerSecretSourceWithExcubitor(source).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(MappingRegistrationError);
    expect((failure as MappingRegistrationError).code).toBe(code);
  }
});
