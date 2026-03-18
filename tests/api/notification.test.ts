import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;

const USER_ID = "user-notif-1";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp();
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: USER_ID, name: "NotifUser", email: "notif@test.com" });
});

const token = generateTestToken(USER_ID);

describe("Notification Preferences", () => {
  it("GET /api/webhooks/notifications/preferences should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.userId).toBe(USER_ID);
    expect(json.preferences).toBeDefined();
    expect(json.preferences.length).toBe(0);
  });

  it("PUT /api/webhooks/notifications/preferences should create preference", async () => {
    const { status, json } = await request(app, "PUT", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
      body: {
        channel: "in_app",
        enabledEvents: ["reservation.created", "schedule.confirmed"],
        reminder: { dayBefore: true, before: true, beforeMinutes: 30 },
      },
    });

    expect(status).toBe(201);
    expect(json.channel).toBe("in_app");
  });

  it("PUT /api/webhooks/notifications/preferences should update existing", async () => {
    // Create first
    await request(app, "PUT", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
      body: { channel: "in_app", enabledEvents: [] },
    });

    // Update
    const { status, json } = await request(app, "PUT", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
      body: {
        channel: "in_app",
        enabledEvents: ["reservation.created"],
        quietHoursStart: "23:00",
      },
    });

    expect(status).toBe(200);
  });
});

describe("Notification History", () => {
  it("GET /api/webhooks/notifications/history should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/webhooks/notifications/history", {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.notifications).toBeDefined();
    expect(json.notifications.length).toBe(0);
  });
});

describe("Webhook CRUD", () => {
  it("POST /api/webhooks/webhooks should create webhook", async () => {
    const { status, json } = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: {
        url: "https://example.com/webhook",
        events: ["reservation.created", "schedule.confirmed"],
      },
    });

    expect(status).toBe(201);
    expect(json.id).toBeDefined();
    expect(json.url).toBe("https://example.com/webhook");
    expect(json.secret).toBeDefined();
    expect(json.isActive).toBe(true);
  });

  it("GET /api/webhooks/webhooks should list webhooks (without secrets)", async () => {
    await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "GET", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.webhooks).toBeDefined();
    expect(json.webhooks.length).toBe(1);
    expect(json.webhooks[0].secret).toBeUndefined();
  });

  it("PUT /api/webhooks/webhooks/:id should update webhook", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "PUT", `/api/webhooks/webhooks/${create.json.id}`, {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/updated", isActive: false },
    });

    expect(status).toBe(200);
    expect(json.url).toBe("https://example.com/updated");
    expect(json.isActive).toBe(false);
  });

  it("DELETE /api/webhooks/webhooks/:id should delete webhook", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "DELETE", `/api/webhooks/webhooks/${create.json.id}`, {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.message).toBe("Webhook deleted");
  });

  it("POST /api/webhooks/webhooks/:id/rotate-secret should rotate secret", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const oldSecret = create.json.secret;

    const { status, json } = await request(app, "POST", `/api/webhooks/webhooks/${create.json.id}/rotate-secret`, {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.secret).toBeDefined();
    expect(json.secret).not.toBe(oldSecret);
  });

  it("GET /api/webhooks/webhooks/:id/logs should return delivery logs", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "GET", `/api/webhooks/webhooks/${create.json.id}/logs`, {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.logs).toBeDefined();
  });
});
