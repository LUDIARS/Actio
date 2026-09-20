import { describe, expect, it } from "vitest";
import { resolveServiceVersion, UNRESOLVED_SERVICE_VERSION } from "../../src/shared/service-version.js";

describe("resolveServiceVersion", () => {
  it("prefers the version Excubitor injects", () => {
    expect(resolveServiceVersion({ EXCUBITOR_SERVICE_VERSION: "0.0.0+abc123" })).toBe("0.0.0+abc123");
  });

  it("ignores a blank injection and falls back to the package version", () => {
    const version = resolveServiceVersion({ EXCUBITOR_SERVICE_VERSION: "  " });
    expect(version).not.toBe(UNRESOLVED_SERVICE_VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
