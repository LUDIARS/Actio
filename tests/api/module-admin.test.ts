/**
 * Tests — Module admin API (Phase 1 SDK infra)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  generateTestToken,
  insertTestUser,
  request,
} from "../helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
  // example モジュール登録が非同期なので少し待つ
  await new Promise((r) => setTimeout(r, 200));
});

beforeEach(() => {
  clearTestDatabase();
});

describe("GET /api/admin/modules", () => {
  it("should require authentication", async () => {
    const { status } = await request(app, "GET", "/api/admin/modules");
    expect(status).toBe(401);
  });

  it("should reject non-admin", async () => {
    insertTestUser({ id: "u1", name: "U1", email: "u1@test.com", role: "general" });
    const token = generateTestToken("u1", "general");
    const { status } = await request(app, "GET", "/api/admin/modules", { token });
    expect(status).toBe(403);
  });

  it("should return installed modules for admin", async () => {
    insertTestUser({ id: "admin-1", name: "Admin", email: "admin@test.com", role: "admin" });
    const token = generateTestToken("admin-1", "admin");
    // example モジュールのインストールが完了するまで待つ
    await new Promise((r) => setTimeout(r, 300));
    const { status, json } = await request(app, "GET", "/api/admin/modules", { token });
    expect(status).toBe(200);
    expect(Array.isArray(json.modules)).toBe(true);
    const example = json.modules.find(
      (m: { moduleId: string }) => m.moduleId === "example",
    );
    expect(example).toBeDefined();
    expect(example.globalEnabled).toBe(true);
  });
});

describe("POST /api/admin/modules/:id/disable and enable", () => {
  beforeEach(() => {
    insertTestUser({ id: "admin-1", name: "Admin", email: "admin@test.com", role: "admin" });
  });

  it("should disable and enable module globally", async () => {
    await new Promise((r) => setTimeout(r, 300));
    const token = generateTestToken("admin-1", "admin");

    // disable
    const d = await request(app, "POST", "/api/admin/modules/example/disable", {
      token,
      body: { scopeType: "global" },
    });
    expect(d.status).toBe(200);
    expect(d.json.enabled).toBe(false);

    // enable
    const e = await request(app, "POST", "/api/admin/modules/example/enable", {
      token,
      body: { scopeType: "global" },
    });
    expect(e.status).toBe(200);
    expect(e.json.enabled).toBe(true);
  });

  it("should return 404 for unknown module", async () => {
    await new Promise((r) => setTimeout(r, 300));
    const token = generateTestToken("admin-1", "admin");
    const { status } = await request(app, "POST", "/api/admin/modules/unknown/enable", {
      token,
      body: { scopeType: "global" },
    });
    expect(status).toBe(404);
  });
});

describe("Example module endpoints", () => {
  it("GET /api/example/hello should work when enabled (default)", async () => {
    // 認証不要ルート (/api/* から userContext は通るが、example は認証チェックなし)
    insertTestUser({ id: "u1", name: "U1", email: "u1@test.com", role: "general" });
    const token = generateTestToken("u1", "general");
    await new Promise((r) => setTimeout(r, 300));
    const { status, json } = await request(app, "GET", "/api/example/hello", { token });
    expect(status).toBe(200);
    expect(json.moduleId).toBe("example");
    expect(json.message).toContain("Hello");
  });
});
