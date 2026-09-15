import { expect, it } from "vitest";
import { applyExcubitorEndpoints, resolveBackendPort } from "../../src/config/service-endpoints.js";

it("maps Excubitor topology env onto Actio settings and overrides legacy values", () => {
  const env: Record<string, string | undefined> = {
    ACTIO_PORT: "17880",
    ACTIO_URL: "http://127.0.0.1:17880",
    ACTIO_FRONTEND_URL: "http://127.0.0.1:17881",
    BACKEND_PORT: "3000",
    FRONTEND_URL: "http://localhost:8080",
  };
  applyExcubitorEndpoints(env);
  expect(env.BACKEND_PORT).toBe("17880");
  expect(env.ACTIO_PUBLIC_URL).toBe("http://127.0.0.1:17880");
  expect(env.FRONTEND_URL).toBe("http://127.0.0.1:17881");
  expect(resolveBackendPort(env)).toBe(17880);
});

it("keeps legacy values when Excubitor does not inject endpoints", () => {
  const env: Record<string, string | undefined> = { BACKEND_PORT: "3000", FRONTEND_URL: "http://localhost:8080", ACTIO_URL: "" };
  applyExcubitorEndpoints(env);
  expect(env.FRONTEND_URL).toBe("http://localhost:8080");
  expect(env.ACTIO_PUBLIC_URL).toBeUndefined();
  expect(resolveBackendPort(env)).toBe(3000);
});

it("rejects a missing or invalid port", () => {
  expect(() => resolveBackendPort({})).toThrow("ACTIO_PORT");
  expect(() => resolveBackendPort({ BACKEND_PORT: "70000" })).toThrow();
});
