import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateProjectSchema = vi.fn();
let localMode = false;

vi.mock("../../src/auth/cernere-client.js", () => ({ updateProjectSchema }));
vi.mock("../../src/auth/local-mode.js", () => ({ localModeEnabled: () => localMode }));

const KEYS = ["CERNERE_URL", "CERNERE_PROJECT_CLIENT_ID", "CERNERE_PROJECT_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

describe("syncProjectSchemaToCernere", () => {
  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    updateProjectSchema.mockReset();
    updateProjectSchema.mockResolvedValue({ columnsAdded: [] });
    localMode = false;
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
  });

  it("does not call Cernere in local mode and logs the skip once", async () => {
    localMode = true;
    process.env.CERNERE_URL = "http://127.0.0.1:1";
    delete process.env.CERNERE_PROJECT_CLIENT_ID;
    delete process.env.CERNERE_PROJECT_CLIENT_SECRET;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { syncProjectSchemaToCernere } = await import("../../src/plugins/schema-sync.js");

    await syncProjectSchemaToCernere();

    expect(updateProjectSchema).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[plugin] ローカルモードのため schema sync をスキップ");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when a public deployment lacks project credentials", async () => {
    process.env.CERNERE_URL = "https://cernere.example";
    delete process.env.CERNERE_PROJECT_CLIENT_ID;
    delete process.env.CERNERE_PROJECT_CLIENT_SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { syncProjectSchemaToCernere } = await import("../../src/plugins/schema-sync.js");

    await expect(syncProjectSchemaToCernere()).resolves.toBeUndefined();

    expect(updateProjectSchema).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("schema sync をスキップ");
  });

  it("syncs when a public deployment has URL and project credentials", async () => {
    process.env.CERNERE_URL = "https://cernere.example";
    process.env.CERNERE_PROJECT_CLIENT_ID = "actio-client";
    process.env.CERNERE_PROJECT_CLIENT_SECRET = "actio-secret";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { syncProjectSchemaToCernere } = await import("../../src/plugins/schema-sync.js");

    await syncProjectSchemaToCernere();

    expect(updateProjectSchema).toHaveBeenCalledTimes(1);
    expect(updateProjectSchema.mock.calls[0]?.[0]).toMatchObject({ project: { key: "actio" } });
  });
});
