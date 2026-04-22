/**
 * プラグインシステム 3 観点の end-to-end 統合検証.
 *
 *   V1. 独自スキーマのデータを userData に反映できるか
 *        = plugin-owned table + `ctx.userData.set/get` が正しく動く
 *   V2. マイプラン更新できてるか
 *        = プラグイン A → `ctx.modules.invoke("myplan", ...)` → プラグイン B の
 *          WS コマンドへ dispatcher 経由で届く
 *   V3. Actio 稼働中に動的につけ外しできるか
 *        = `installModule()` / `uninstallModule()` で register/unregister が
 *          propagation し、ゾンビルート / ゾンビハンドラが残らない
 *
 * Cernere は projectData 操作をブロックする (WS 無し) ので、`cernere-client`
 * を `vi.mock` で in-memory 実装に差し替えて userData の反映を観測する.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { defineModule } from "@ludiars/schedula-sdk";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── Cernere のモック. 全テストで共有する in-memory store.
//    (現実の Cernere プロジェクトテーブル `project_data_{key}` 相当.)
const fakeCernereStore = new Map<string, Record<string, unknown>>();

vi.mock("../src/auth/cernere-client.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/auth/cernere-client.js")
  >("../src/auth/cernere-client.js");
  return {
    ...actual,
    setProjectUserData: vi.fn(
      async (userId: string, data: Record<string, unknown>) => {
        const row = fakeCernereStore.get(userId) ?? {};
        Object.assign(row, data);
        fakeCernereStore.set(userId, row);
        return { ok: true, updated: Object.keys(data) };
      },
    ),
    getProjectUserColumns: vi.fn(
      async (userId: string, columns?: string[]) => {
        const row = fakeCernereStore.get(userId) ?? {};
        if (!columns) return { ...row };
        const out: Record<string, unknown> = {};
        for (const c of columns) if (c in row) out[c] = row[c];
        return out;
      },
    ),
    deleteProjectUserColumns: vi.fn(
      async (userId: string, columns: string[]) => {
        const row = fakeCernereStore.get(userId) ?? {};
        for (const c of columns) delete row[c];
        fakeCernereStore.set(userId, row);
        return { ok: true, deleted: columns };
      },
    ),
  };
});

// ── テスト対象の host-side モジュール ──────────────────
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
} from "./helpers.js";
import {
  installModule,
  uninstallModule,
  __resetLoaderStateForTest,
} from "../src/plugins/loader.js";
import { moduleRegistry } from "../src/plugins/registry.js";
import {
  dispatch,
  listCommands,
  __clearCommandsForTest,
} from "../src/ws/dispatcher.js";
import { buildModuleContext } from "../src/plugins/context.js";

beforeAll(() => {
  initTestDatabase();
});

beforeEach(() => {
  clearTestDatabase();
  __resetLoaderStateForTest();
  __clearCommandsForTest();
  fakeCernereStore.clear();
  // Remove any lingering registrations from prior tests.
  for (const id of [
    "v1-storage",
    "v2-myplan",
    "v2-caller",
    "v3-dynamic",
    "v3-dynamic-v2",
  ]) {
    try { moduleRegistry.unregister(id); } catch { /* ignore */ }
  }
  insertTestUser({ id: "user-alice", name: "Alice", email: "a@test.com" });
});

// ═════════════════════════════════════════════════════════════
// V1: 独自スキーマ + userData 反映
// ═════════════════════════════════════════════════════════════

describe("V1 — plugin-owned table + userData reflection", () => {
  it("writes to both plugin table and Cernere userData, reads both back", async () => {
    // Plugin declares a private table AND a userData key.
    const favs = sqliteTable("v1_favourites", {
      id:     text("id").primaryKey(),
      userId: text("user_id").notNull(),
      color:  text("color").notNull(),
      count:  integer("count"),
    });

    const def = defineModule({
      id:  "v1-storage",
      name: "V1 storage",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      tables: { favs },
      userData: {
        favColor: { type: "text", description: "user's favourite colour" },
      },
    });

    const app = new Hono();
    installModule(app, def, { packageName: "t", packageVersion: "0.0.0" });

    // Plugin code path (normally inside a route handler) — use ctx directly.
    const ctx = buildModuleContext("v1-storage", { favs }, []);

    // (a) Private table INSERT via module-scoped db proxy (exercises S3).
    const dbApi = ctx.db.raw as unknown as {
      insert: (t: typeof favs) => {
        values: (v: Record<string, unknown>) => { run: () => Promise<unknown> };
      };
      select: () => {
        from: (t: typeof favs) => { all: () => Promise<Array<Record<string, unknown>>> };
      };
    };
    await dbApi
      .insert(favs)
      .values({ id: "row-1", userId: "user-alice", color: "blue", count: 3 })
      .run();

    // (b) userData SET — hits the Cernere client mock.
    await ctx.userData.set("user-alice", "favColor", "blue");

    // (c) Verify table round-trip.
    const rows = await dbApi.select().from(favs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "row-1",
      userId: "user-alice",
      color: "blue",
      count: 3,
    });

    // (d) Verify userData round-trip (keyed as "v1-storage:fav_color" per
    //     context.ts columnKey() conversion).
    const reloaded = await ctx.userData.get<string>("user-alice", "favColor");
    expect(reloaded).toBe("blue");

    // (e) And the Cernere store itself saw the underlying column key.
    const cernereRow = fakeCernereStore.get("user-alice");
    expect(cernereRow).toBeDefined();
    expect(cernereRow!["v1-storage:fav_color"]).toBe("blue");
  });

  it("caller-scoped userDataAs rejects anonymous callers", () => {
    const ctx = buildModuleContext("v1-storage", undefined, []);
    expect(() => ctx.userDataAs("")).toThrow(/callerId/i);
    expect(() => ctx.userDataAs("anonymous")).toThrow(/callerId/i);
  });
});

// ═════════════════════════════════════════════════════════════
// V2: modules.invoke → myplan.create
// ═════════════════════════════════════════════════════════════

describe("V2 — modules.invoke routes through dispatcher", () => {
  it("caller plugin can update a mock myplan via ctx.modules.invoke", async () => {
    const app = new Hono();

    // Mock myplan plugin exposing a `create` WS command.
    const received: Array<{ userId: string; payload: unknown }> = [];
    const myplanMock = defineModule({
      id: "v2-myplan",
      name: "MyPlan mock",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      wsCommands: {
        create: async (userId, payload) => {
          received.push({ userId, payload });
          return { planId: "plan-xyz", echoed: payload };
        },
      },
    });
    installModule(app, myplanMock, { packageName: "t", packageVersion: "0.0.0" });

    // Caller plugin declares the dependency.
    const caller = defineModule({
      id: "v2-caller",
      name: "caller",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      depends: ["v2-myplan"],
    });
    installModule(app, caller, { packageName: "t", packageVersion: "0.0.0" });

    const callerCtx = buildModuleContext("v2-caller", undefined, ["v2-myplan"]);
    const result = await callerCtx.modules.invoke<{ planId: string; echoed: unknown }>(
      "v2-myplan",
      "create",
      { title: "新学期", weeklySlots: 8 },
    );

    expect(result.planId).toBe("plan-xyz");
    expect(result.echoed).toEqual({ title: "新学期", weeklySlots: 8 });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ title: "新学期", weeklySlots: 8 });
    // dispatcher injects a synthetic caller id when invoked by a plugin.
    expect(received[0]!.userId).toBe("module:v2-caller");
  });

  it("rejects modules.invoke when the dependency is not declared", async () => {
    // Ensure target is registered but caller did NOT declare it.
    const app = new Hono();
    installModule(
      app,
      defineModule({
        id: "v2-myplan",
        name: "MyPlan mock",
        schedulaApiVersion: "^1.0.0",
        scope: "global",
        wsCommands: { create: async () => ({}) },
      }),
      { packageName: "t", packageVersion: "0.0.0" },
    );

    // depends: [] — access should be refused even if target exists.
    const rogue = buildModuleContext("v2-caller", undefined, []);
    await expect(
      rogue.modules.invoke("v2-myplan", "create", {}),
    ).rejects.toThrow(/did not declare dependency/i);
  });
});

// ═════════════════════════════════════════════════════════════
// V3: 動的 install / uninstall
// ═════════════════════════════════════════════════════════════

describe("V3 — dynamic install / uninstall", () => {
  it("install → dispatch works → uninstall → dispatch fails → reinstall works", async () => {
    const app = new Hono();

    // Initially not installed.
    expect(moduleRegistry.has("v3-dynamic")).toBe(false);

    const defv1 = defineModule({
      id: "v3-dynamic",
      name: "dynamic v1",
      version: "1.0.0",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      wsCommands: {
        ping: async () => ({ ok: true, from: "v1" }),
      },
    });
    installModule(app, defv1, { packageName: "t", packageVersion: "0.0.0" });

    expect(moduleRegistry.has("v3-dynamic")).toBe(true);
    const r1 = await dispatch(
      "v3-dynamic",
      "ping",
      { userId: "user-alice", userRole: "general" },
      {},
    );
    expect(r1).toEqual({ ok: true, from: "v1" });

    // Uninstall — registry + dispatcher should drop the module.
    await uninstallModule("v3-dynamic");

    expect(moduleRegistry.has("v3-dynamic")).toBe(false);
    // WS command ゾンビ化していないこと
    expect(
      listCommands().some((e) => e.module === "v3-dynamic" && e.action === "ping"),
    ).toBe(false);
    // dispatch は "unknown module" 相当で reject
    await expect(
      dispatch(
        "v3-dynamic",
        "ping",
        { userId: "user-alice", userRole: "general" },
        {},
      ),
    ).rejects.toThrow();

    // 再インストール (別バージョン) — moduleId 再利用可能.
    const defv2 = defineModule({
      id: "v3-dynamic",
      name: "dynamic v2",
      version: "2.0.0",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      wsCommands: {
        ping: async () => ({ ok: true, from: "v2" }),
      },
    });
    installModule(app, defv2, { packageName: "t", packageVersion: "0.0.0" });
    const r2 = await dispatch(
      "v3-dynamic",
      "ping",
      { userId: "user-alice", userRole: "general" },
      {},
    );
    expect(r2).toEqual({ ok: true, from: "v2" });
  });

  it("uninstall releases basePath so a different plugin can claim it later", async () => {
    const app = new Hono();

    const first = defineModule({
      id: "v3-dynamic",
      name: "first",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      basePath: "/api/v3-takeover",
      routes: (a) => { a.get("/", (c) => c.json({ who: "first" })); },
    });
    installModule(app, first, { packageName: "t", packageVersion: "0.0.0" });

    await uninstallModule("v3-dynamic");

    // Someone else (different moduleId) can claim the freed basePath without
    // S5's overlap check firing.
    const second = defineModule({
      id: "v3-dynamic-v2",
      name: "second",
      schedulaApiVersion: "^1.0.0",
      scope: "global",
      basePath: "/api/v3-takeover",
      routes: (a) => { a.get("/", (c) => c.json({ who: "second" })); },
    });
    expect(() =>
      installModule(app, second, { packageName: "t", packageVersion: "0.0.0" }),
    ).not.toThrow();
  });
});
