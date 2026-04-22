/**
 * Issue #111 — プラグインシステム セキュリティ強化
 *
 * S1 / S4 / S5 / S6 / S9 / D9 の回帰テスト。
 * S2 と S3 は相応の場所にそれぞれ別テストを置く (admin-routes / db-scope).
 */

import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { defineModule } from "@ludiars/schedula-sdk";
import {
  dispatch,
  DispatcherAuthError,
  listCommands,
  registerCommand,
  registerCommandEntry,
  __clearCommandsForTest,
} from "../src/ws/dispatcher.js";
import {
  installModule,
  ModuleLoadError,
  __resetLoaderStateForTest,
} from "../src/plugins/loader.js";
import { moduleRegistry, ModuleRegistryError } from "../src/plugins/registry.js";
import { satisfiesSemverRange } from "../src/plugins/semver.js";

// -------------------------------------------------------------------------
// S1: WS dispatcher auth ガード
// -------------------------------------------------------------------------

describe("Issue #111 S1 — dispatcher auth gate", () => {
  beforeEach(() => {
    __clearCommandsForTest();
  });

  it("rejects empty / anonymous / unknown userId by default (requireAuth=true)", async () => {
    let called = false;
    registerCommand("t", "a", async () => { called = true; return {}; });
    for (const uid of ["", "anonymous", "unknown"]) {
      await expect(
        dispatch("t", "a", { userId: uid, userRole: "general" }, {}),
      ).rejects.toBeInstanceOf(DispatcherAuthError);
    }
    expect(called).toBe(false);
  });

  it("permits anonymous when requireAuth=false", async () => {
    let captured: string | null = null;
    registerCommandEntry("t", "open", {
      handler: async (userId) => { captured = userId; return "ok"; },
      requireAuth: false,
    });
    const r = await dispatch("t", "open", { userId: "", userRole: "general" }, {});
    expect(r).toBe("ok");
    expect(captured).toBe("");
  });

  it("enforces requireRole: non-admin cannot call system_admin commands", async () => {
    registerCommandEntry("t", "danger", {
      handler: async () => "ok",
      requireAuth: true,
      requireRole: "system_admin",
    });
    await expect(
      dispatch("t", "danger", { userId: "u1", userRole: "general" }, {}),
    ).rejects.toMatchObject({ name: "DispatcherAuthError", code: "forbidden" });

    const r = await dispatch("t", "danger", { userId: "admin", userRole: "admin" }, {});
    expect(r).toBe("ok");
  });

  it("group_owner satisfies group_leader/group_member requirement", async () => {
    registerCommandEntry("t", "leader-op", {
      handler: async () => "ok",
      requireAuth: true,
      requireRole: "group_leader",
    });
    for (const role of ["group_owner", "group_leader"]) {
      expect(
        await dispatch("t", "leader-op", { userId: "u", userRole: role }, {}),
      ).toBe("ok");
    }
    await expect(
      dispatch("t", "leader-op", { userId: "u", userRole: "group_member" }, {}),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("listCommands exposes requireAuth / requireRole metadata", () => {
    registerCommand("t", "default", async () => "");
    registerCommandEntry("t", "open", { handler: async () => "", requireAuth: false });
    const entries = listCommands();
    expect(entries).toContainEqual(expect.objectContaining({
      module: "t", action: "default", requireAuth: true,
    }));
    expect(entries).toContainEqual(expect.objectContaining({
      module: "t", action: "open", requireAuth: false,
    }));
  });

  it("accepts the legacy string-only third argument (userRole defaults to 'general')", async () => {
    registerCommandEntry("t", "role-gated", {
      handler: async () => "ok",
      requireAuth: true,
      requireRole: "system_admin",
    });
    await expect(
      dispatch("t", "role-gated", "real-user-id", {}),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

// -------------------------------------------------------------------------
// S4: moduleRegistry duplicate registration
// -------------------------------------------------------------------------

describe("Issue #111 S4 — registry rejects duplicate register()", () => {
  it("throws on duplicate id", () => {
    moduleRegistry.unregister("dup-test");
    const mod = {
      definition: {
        id: "dup-test",
        name: "dup-test",
        schedulaApiVersion: "^1.0.0",
        scope: "global" as const,
      },
      packageName: "t",
      packageVersion: "0.0.0",
    };
    moduleRegistry.register(mod);
    expect(() => moduleRegistry.register(mod)).toThrow(ModuleRegistryError);
    moduleRegistry.unregister("dup-test");
  });
});

// -------------------------------------------------------------------------
// S5: basePath collision + reserved prefixes
// -------------------------------------------------------------------------

describe("Issue #111 S5 — basePath collision detection", () => {
  beforeEach(() => {
    __resetLoaderStateForTest();
    moduleRegistry.unregister("p1");
    moduleRegistry.unregister("p2");
    moduleRegistry.unregister("p3");
  });

  it("rejects basePath that shadows a reserved core prefix", () => {
    const app = new Hono();
    const def = defineModule({
      id: "p1",
      name: "p1",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      basePath: "/api/admin/plugins",
      routes: (a) => { a.get("/", (c) => c.json({ ok: true })); },
    });
    expect(() => installModule(app, def, { packageName: "t", packageVersion: "0.0.0" }))
      .toThrow(/reserved/i);
  });

  it("rejects a second module that overlaps a mounted path", () => {
    const app = new Hono();
    const a = defineModule({
      id: "p2", name: "p2", schedulaApiVersion: "^1.0.0", scope: "global",
      basePath: "/api/myplugin",
      routes: (x) => { x.get("/", (c) => c.json({ ok: true })); },
    });
    installModule(app, a, { packageName: "t", packageVersion: "0.0.0" });

    const b = defineModule({
      id: "p3", name: "p3", schedulaApiVersion: "^1.0.0", scope: "global",
      basePath: "/api/myplugin/nested",
      routes: (x) => { x.get("/", (c) => c.json({ ok: true })); },
    });
    expect(() => installModule(app, b, { packageName: "t", packageVersion: "0.0.0" }))
      .toThrow(/collides/i);

    moduleRegistry.unregister("p2");
  });
});

// -------------------------------------------------------------------------
// S9 / D9: depends + schedulaApiVersion validation
// -------------------------------------------------------------------------

describe("Issue #111 S9 / D9 — depends + semver validation", () => {
  beforeEach(() => {
    __resetLoaderStateForTest();
    for (const id of ["s9-a", "s9-b", "s9-c", "s9-self"]) {
      moduleRegistry.unregister(id);
    }
  });

  it("rejects an incompatible schedulaApiVersion", () => {
    const app = new Hono();
    const def = defineModule({
      id: "s9-a", name: "s9-a",
      schedulaApiVersion: "^99.0.0",
      scope: "global",
    });
    expect(() => installModule(app, def, { packageName: "t", packageVersion: "0.0.0" }))
      .toThrow(/schedulaApiVersion/i);
  });

  it("rejects when a declared dependency is not yet installed", () => {
    const app = new Hono();
    const def = defineModule({
      id: "s9-b", name: "s9-b",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      depends: ["does-not-exist"],
    });
    expect(() => installModule(app, def, { packageName: "t", packageVersion: "0.0.0" }))
      .toThrow(ModuleLoadError);
  });

  it("rejects self-dependency", () => {
    const app = new Hono();
    const def = defineModule({
      id: "s9-self", name: "s9-self",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      depends: ["s9-self"],
    });
    expect(() => installModule(app, def, { packageName: "t", packageVersion: "0.0.0" }))
      .toThrow(/self-dependency/i);
  });

  it("accepts a module whose dependency was installed first", () => {
    const app = new Hono();
    const a = defineModule({
      id: "s9-c", name: "s9-c",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
    });
    installModule(app, a, { packageName: "t", packageVersion: "0.0.0" });

    const b = defineModule({
      id: "s9-a", name: "s9-a",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      depends: ["s9-c"],
    });
    expect(() => installModule(app, b, { packageName: "t", packageVersion: "0.0.0" }))
      .not.toThrow();
  });
});

describe("semver range matcher", () => {
  it("caret + tilde + exact + or", () => {
    expect(satisfiesSemverRange("1.2.3", "^1.0.0")).toBe(true);
    expect(satisfiesSemverRange("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfiesSemverRange("1.2.3", "~1.2.0")).toBe(true);
    expect(satisfiesSemverRange("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfiesSemverRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesSemverRange("1.2.3", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfiesSemverRange("0.9.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(satisfiesSemverRange("1.0.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfiesSemverRange("2.0.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfiesSemverRange("3.0.0", "^1.0.0 || ^2.0.0")).toBe(false);
    expect(satisfiesSemverRange("1.0.0", "*")).toBe(true);
  });

  it("returns false on malformed input (fail-closed)", () => {
    expect(satisfiesSemverRange("not-a-version", "^1.0.0")).toBe(false);
    expect(satisfiesSemverRange("1.0.0", "garbage")).toBe(false);
  });
});
