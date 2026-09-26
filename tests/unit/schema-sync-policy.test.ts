import { describe, expect, it } from "vitest";
import { shouldSyncSchema, type SchemaSyncInput } from "../../src/plugins/schema-sync-policy.js";

const complete: SchemaSyncInput = {
  localMode: false,
  cernereUrl: "https://cernere.example",
  clientId: "actio-client",
  clientSecret: "actio-secret",
};

describe("shouldSyncSchema", () => {
  it("syncs on a public deployment with URL and project credentials", () => {
    expect(shouldSyncSchema(complete)).toEqual({ sync: true });
  });

  it("skips with an info log in local mode even when credentials are complete", () => {
    const decision = shouldSyncSchema({ ...complete, localMode: true });
    expect(decision).toMatchObject({ sync: false, reason: "local-mode", level: "info" });
    if (!decision.sync) expect(decision.message).toContain("ローカルモードのため schema sync をスキップ");
  });

  it("skips local mode before looking at CERNERE_URL (URL-only local config)", () => {
    const decision = shouldSyncSchema({ localMode: true, cernereUrl: "http://127.0.0.1:1", clientId: "", clientSecret: "" });
    expect(decision).toMatchObject({ sync: false, reason: "local-mode", level: "info" });
  });

  it("skips with an info log when CERNERE_URL is unset", () => {
    expect(shouldSyncSchema({ ...complete, cernereUrl: "" }))
      .toMatchObject({ sync: false, reason: "no-cernere-url", level: "info" });
  });

  it.each([
    ["client id", { clientId: "" }],
    ["client secret", { clientSecret: "" }],
    ["both", { clientId: "", clientSecret: "" }],
  ])("skips with a warn log when the %s is missing on a public deployment", (_label, missing) => {
    expect(shouldSyncSchema({ ...complete, ...missing }))
      .toMatchObject({ sync: false, reason: "missing-credentials", level: "warn" });
  });
});
