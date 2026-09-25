import { expect, it } from "vitest";
import { applyExcubitorServiceConfig } from "../../src/config/excubitor/service-config.js";

it("expands the JSON runtime config into the environment without overriding injected values", () => {
  const env: Record<string, string | undefined> = {
    EXCUBITOR_SERVICE_CONFIG_JSON: JSON.stringify({ ACTIO_CONFIG_KEY: "k".repeat(32), REDIS_URL: "redis://stored.invalid", nested: { a: 1 }, "bad-key": "x" }),
    REDIS_URL: "redis://injected.invalid",
  };
  expect(applyExcubitorServiceConfig(env)).toEqual(["ACTIO_CONFIG_KEY"]);
  expect(env.ACTIO_CONFIG_KEY).toBe("k".repeat(32));
  expect(env.REDIS_URL).toBe("redis://injected.invalid");
  expect(env).not.toHaveProperty("nested");
  expect(env).not.toHaveProperty("bad-key");
});

it("does nothing without the variable and refuses a corrupted one", () => {
  expect(applyExcubitorServiceConfig({})).toEqual([]);
  expect(() => applyExcubitorServiceConfig({ EXCUBITOR_SERVICE_CONFIG_JSON: "{oops" })).toThrow("not valid JSON");
  expect(() => applyExcubitorServiceConfig({ EXCUBITOR_SERVICE_CONFIG_JSON: "[1]" })).toThrow("JSON object");
});
