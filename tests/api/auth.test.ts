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
  it("should return current user", async () => {
    insertTestUser({ id: "user-1", name: "MeUser", email: "me@test.com", role: "general" });
    const token = generateTestToken("user-1", "general");

    const { status, json } = await request(app, "GET", "/api/auth/me", { token });

    expect(status).toBe(200);
    expect(json.name).toBe("MeUser");
    expect(json.email).toBe("me@test.com");
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
  it("should change user role", async () => {
    insertTestUser({ id: "admin-1", name: "Admin", email: "admin@test.com", role: "admin" });
    insertTestUser({ id: "user-1", name: "User", email: "user@test.com", role: "general" });
    const token = generateTestToken("admin-1", "admin");

    const { status, json } = await request(app, "PUT", "/api/auth/users/user-1/role", {
      token,
      body: { role: "group_leader" },
    });

    expect(status).toBe(200);
    expect(json.user.role).toBe("group_leader");
  });

  it("should reject invalid role", async () => {
    insertTestUser({ id: "admin-1", name: "Admin", email: "admin@test.com", role: "admin" });
    insertTestUser({ id: "user-1", name: "User", email: "user@test.com", role: "general" });
    const token = generateTestToken("admin-1", "admin");

    const { status } = await request(app, "PUT", "/api/auth/users/user-1/role", {
      token,
      body: { role: "superadmin" },
    });

    expect(status).toBe(400);
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
