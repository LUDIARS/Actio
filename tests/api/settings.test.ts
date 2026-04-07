import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;

const ADMIN_ID = "user-settings-admin";
const USER_ID = "user-settings-general";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: ADMIN_ID, name: "Admin", email: "admin@test.com", role: "admin" });
  insertTestUser({ id: USER_ID, name: "User", email: "user@test.com", role: "general" });
});

const adminToken = generateTestToken(ADMIN_ID, "admin");
const userToken = generateTestToken(USER_ID, "general");

describe("GET /api/settings", () => {
  it("should return default settings for admin", async () => {
    const { status, json } = await request(app, "GET", "/api/settings", { token: adminToken });

    expect(status).toBe(200);
    expect(json.settings).toBeDefined();
    expect(json.settings["session.refreshTokenDays"]).toBe("30");
    expect(json.settings["session.accessTokenMinutes"]).toBe("60");
    expect(json.settings["app.name"]).toBe("Schedula");
  });

  it("should reject non-admin users", async () => {
    const { status } = await request(app, "GET", "/api/settings", { token: userToken });

    expect(status).toBe(403);
  });

  it("should reject unauthenticated requests", async () => {
    const { status } = await request(app, "GET", "/api/settings");

    // requireRole middleware returns 403 for anonymous users (role=general)
    expect(status).toBe(403);
  });
});

describe("PUT /api/settings", () => {
  it("should save and return updated settings", async () => {
    const { status, json } = await request(app, "PUT", "/api/settings", {
      token: adminToken,
      body: {
        settings: {
          "app.name": "MyApp",
          "session.refreshTokenDays": "14",
        },
      },
    });

    expect(status).toBe(200);
    expect(json.settings["app.name"]).toBe("MyApp");
    expect(json.settings["session.refreshTokenDays"]).toBe("14");
    // Unchanged default should still be present
    expect(json.settings["session.accessTokenMinutes"]).toBe("60");
  });

  it("should persist settings across requests", async () => {
    await request(app, "PUT", "/api/settings", {
      token: adminToken,
      body: { settings: { "app.name": "Persisted" } },
    });

    const { status, json } = await request(app, "GET", "/api/settings", { token: adminToken });

    expect(status).toBe(200);
    expect(json.settings["app.name"]).toBe("Persisted");
  });

  it("should reject invalid body", async () => {
    const { status } = await request(app, "PUT", "/api/settings", {
      token: adminToken,
      body: { notSettings: true },
    });

    expect(status).toBe(400);
  });

  it("should reject non-admin users", async () => {
    const { status } = await request(app, "PUT", "/api/settings", {
      token: userToken,
      body: { settings: { "app.name": "Hacked" } },
    });

    expect(status).toBe(403);
  });
});
