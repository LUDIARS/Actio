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
  app = mod.createApp();
});

beforeEach(() => {
  clearTestDatabase();
});

describe("POST /api/auth/register", () => {
  it("should register a new user (first user becomes admin)", async () => {
    const { status, json } = await request(app, "POST", "/api/auth/register", {
      body: { name: "TestAdmin", email: "admin@test.com", password: "password123" },
    });

    expect(status).toBe(201);
    expect(json.user).toBeDefined();
    expect(json.user.name).toBe("TestAdmin");
    expect(json.user.email).toBe("admin@test.com");
    expect(json.user.role).toBe("admin");
    expect(json.accessToken).toBeDefined();
    expect(json.refreshToken).toBeDefined();
  });

  it("should register second user as general", async () => {
    // First user (admin)
    await request(app, "POST", "/api/auth/register", {
      body: { name: "Admin", email: "admin@test.com", password: "password123" },
    });

    // Second user (general)
    const { status, json } = await request(app, "POST", "/api/auth/register", {
      body: { name: "User", email: "user@test.com", password: "password123" },
    });

    expect(status).toBe(201);
    expect(json.user.role).toBe("general");
  });

  it("should reject missing fields", async () => {
    const { status, json } = await request(app, "POST", "/api/auth/register", {
      body: { name: "Test" },
    });

    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("should reject short password", async () => {
    const { status } = await request(app, "POST", "/api/auth/register", {
      body: { name: "Test", email: "test@test.com", password: "short" },
    });

    expect(status).toBe(400);
  });

  it("should reject duplicate email", async () => {
    await request(app, "POST", "/api/auth/register", {
      body: { name: "Test", email: "dup@test.com", password: "password123" },
    });

    const { status } = await request(app, "POST", "/api/auth/register", {
      body: { name: "Test2", email: "dup@test.com", password: "password456" },
    });

    expect(status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app, "POST", "/api/auth/register", {
      body: { name: "LoginUser", email: "login@test.com", password: "password123" },
    });
  });

  it("should login with valid credentials", async () => {
    const { status, json } = await request(app, "POST", "/api/auth/login", {
      body: { email: "login@test.com", password: "password123" },
    });

    expect(status).toBe(200);
    expect(json.user).toBeDefined();
    expect(json.accessToken).toBeDefined();
    expect(json.refreshToken).toBeDefined();
  });

  it("should reject wrong password", async () => {
    const { status } = await request(app, "POST", "/api/auth/login", {
      body: { email: "login@test.com", password: "wrongpassword" },
    });

    expect(status).toBe(401);
  });

  it("should reject unknown email", async () => {
    const { status } = await request(app, "POST", "/api/auth/login", {
      body: { email: "unknown@test.com", password: "password123" },
    });

    expect(status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("should refresh token", async () => {
    const reg = await request(app, "POST", "/api/auth/register", {
      body: { name: "RefreshUser", email: "refresh@test.com", password: "password123" },
    });

    const { status, json } = await request(app, "POST", "/api/auth/refresh", {
      body: { refreshToken: reg.json.refreshToken },
    });

    expect(status).toBe(200);
    expect(json.accessToken).toBeDefined();
    expect(json.refreshToken).toBeDefined();
  });

  it("should reject invalid refresh token", async () => {
    const { status } = await request(app, "POST", "/api/auth/refresh", {
      body: { refreshToken: "invalid-token" },
    });

    expect(status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("should return current user", async () => {
    const reg = await request(app, "POST", "/api/auth/register", {
      body: { name: "MeUser", email: "me@test.com", password: "password123" },
    });

    const { status, json } = await request(app, "GET", "/api/auth/me", {
      token: reg.json.accessToken,
    });

    expect(status).toBe(200);
    expect(json.name).toBe("MeUser");
    expect(json.email).toBe("me@test.com");
  });

  it("should reject without token", async () => {
    const { status } = await request(app, "GET", "/api/auth/me");
    expect(status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("should logout successfully", async () => {
    const reg = await request(app, "POST", "/api/auth/register", {
      body: { name: "LogoutUser", email: "logout@test.com", password: "password123" },
    });

    const { status, json } = await request(app, "POST", "/api/auth/logout", {
      body: { refreshToken: reg.json.refreshToken },
    });

    expect(status).toBe(200);
    expect(json.message).toBe("Logged out");
  });
});

describe("GET /api/auth/users (admin)", () => {
  it("should return user list for admin", async () => {
    const reg = await request(app, "POST", "/api/auth/register", {
      body: { name: "AdminUser", email: "admin@test.com", password: "password123" },
    });

    const { status, json } = await request(app, "GET", "/api/auth/users", {
      token: reg.json.accessToken,
    });

    expect(status).toBe(200);
    expect(json.users).toBeDefined();
    expect(json.users.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-admin", async () => {
    await request(app, "POST", "/api/auth/register", {
      body: { name: "Admin", email: "admin@test.com", password: "password123" },
    });

    const reg2 = await request(app, "POST", "/api/auth/register", {
      body: { name: "User", email: "user@test.com", password: "password123" },
    });

    const { status } = await request(app, "GET", "/api/auth/users", {
      token: reg2.json.accessToken,
    });

    expect(status).toBe(403);
  });
});

describe("PUT /api/auth/users/:id/role", () => {
  it("should change user role", async () => {
    const admin = await request(app, "POST", "/api/auth/register", {
      body: { name: "Admin", email: "admin@test.com", password: "password123" },
    });

    const user = await request(app, "POST", "/api/auth/register", {
      body: { name: "User", email: "user@test.com", password: "password123" },
    });

    const { status, json } = await request(app, "PUT", `/api/auth/users/${user.json.user.id}/role`, {
      token: admin.json.accessToken,
      body: { role: "group_leader" },
    });

    expect(status).toBe(200);
    expect(json.user.role).toBe("group_leader");
  });
});
