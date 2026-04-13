import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  generateTestToken,
  insertTestUser,
  request,
} from "../helpers.js";

let app: any;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
});

// 認証処理 (login/register/refresh/logout) は Cernere に委譲済み。
// ここでは Schedula 固有のエンドポイントのみテストする。

describe("GET /api/auth/me", () => {
  // 個人データ (name/email/role) は Cernere 単一情報源。
  // テスト環境では Cernere 未接続のため `getUserInfo` はプレースホルダを返す。
  // (`user-${id.slice(0,8)}` / `${id}@unknown.local` / "general")

  it("should return current user with placeholder when Cernere unavailable", async () => {
    insertTestUser({ id: "user-1", name: "MeUser", email: "me@test.com", role: "general" });
    const token = generateTestToken("user-1", "general");

    const { status, json } = await request(app, "GET", "/api/auth/me", { token });

    expect(status).toBe(200);
    expect(json.id).toBe("user-1");
    // Cernere 未接続時のプレースホルダ
    expect(json.name).toBe("user-user-1");
    expect(json.email).toBe("user-1@unknown.local");
    expect(json.role).toBe("general");
  });

  it("should auto-provision user if not in local DB", async () => {
    const token = generateTestToken("new-user-1", "general");

    const { status, json } = await request(app, "GET", "/api/auth/me", { token });

    expect(status).toBe(200);
    expect(json.id).toBe("new-user-1");
  });

  it("should reject without token", async () => {
    const { status } = await request(app, "GET", "/api/auth/me");
    expect(status).toBe(401);
  });
});

describe("GET /api/auth/users (admin)", () => {
  it("should return user list for admin", async () => {
    insertTestUser({ id: "admin-1", name: "AdminUser", email: "admin@test.com", role: "admin" });
    const token = generateTestToken("admin-1", "admin");

    const { status, json } = await request(app, "GET", "/api/auth/users", { token });

    expect(status).toBe(200);
    expect(json.users).toBeDefined();
    expect(json.users.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-admin", async () => {
    insertTestUser({ id: "user-1", name: "User", email: "user@test.com", role: "general" });
    const token = generateTestToken("user-1", "general");

    const { status } = await request(app, "GET", "/api/auth/users", { token });

    expect(status).toBe(403);
  });
});

describe("PUT /api/auth/users/:id/role", () => {
  // role 管理は Cernere に移管された (個人データ保管禁止ルール)。
  // Schedula 側のエンドポイントは 410 Gone を返す。

  it("should return 410 (role management moved to Cernere)", async () => {
    insertTestUser({ id: "admin-1", name: "Admin", email: "admin@test.com", role: "admin" });
    insertTestUser({ id: "user-1", name: "User", email: "user@test.com", role: "general" });
    const token = generateTestToken("admin-1", "admin");

    const { status, json } = await request(app, "PUT", "/api/auth/users/user-1/role", {
      token,
      body: { role: "group_leader" },
    });

    expect(status).toBe(410);
    expect(json.error).toMatch(/Cernere/);
  });

  it("should reject non-admin", async () => {
    insertTestUser({ id: "user-1", name: "User", email: "user@test.com", role: "general" });
    insertTestUser({ id: "user-2", name: "User2", email: "user2@test.com", role: "general" });
    const token = generateTestToken("user-1", "general");

    const { status } = await request(app, "PUT", "/api/auth/users/user-2/role", {
      token,
      body: { role: "admin" },
    });

    expect(status).toBe(403);
  });
});
