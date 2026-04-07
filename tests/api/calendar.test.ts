import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;
let token: string;
let userId: string;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(async () => {
  clearTestDatabase();
  userId = "user-1";
  insertTestUser({ id: userId, name: "CalUser", email: "cal@test.com" });
  token = generateTestToken(userId);
});

describe("Personal Events", () => {
  it("GET /api/calendar/personal should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/calendar/personal", {
      token,
    });

    expect(status).toBe(200);
    expect(json.events).toBeDefined();
    expect(json.events.length).toBe(0);
  });

  it("POST /api/calendar/personal should create event", async () => {
    const { status, json } = await request(app, "POST", "/api/calendar/personal", {
      token,
      body: { title: "Study", day: 0, period: 0, duration: 1 },
    });

    expect(status).toBe(201);
    expect(json.event).toBeDefined();
    expect(json.event.title).toBe("Study");
  });

  it("PUT /api/calendar/personal/:id should update event", async () => {
    const create = await request(app, "POST", "/api/calendar/personal", {
      token,
      body: { title: "Study", day: 0, period: 0, duration: 1 },
    });

    const eventId = create.json.event.id;
    const { status, json } = await request(app, "PUT", `/api/calendar/personal/${eventId}`, {
      token,
      body: { title: "Updated Study" },
    });

    expect(status).toBe(200);
    expect(json.event.title).toBe("Updated Study");
  });

  it("DELETE /api/calendar/personal/:id should delete event", async () => {
    const create = await request(app, "POST", "/api/calendar/personal", {
      token,
      body: { title: "Study", day: 0, period: 0, duration: 1 },
    });

    const { status } = await request(app, "DELETE", `/api/calendar/personal/${create.json.event.id}`, {
      token,
    });

    expect(status).toBe(200);
  });
});

describe("Plans", () => {
  it("GET /api/calendar/plans should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/calendar/plans", {
      token,
    });

    expect(status).toBe(200);
    expect(json.plans).toBeDefined();
  });

  it("POST /api/calendar/plans should create a plan", async () => {
    const { status, json } = await request(app, "POST", "/api/calendar/plans", {
      token,
      body: {
        name: "Weekly Meeting",
        days: [0, 2, 4],
        startPeriod: 2,
        duration: 1,
        eventType: "personal",
      },
    });

    expect(status).toBe(201);
    expect(json.plan).toBeDefined();
    expect(json.plan.name).toBe("Weekly Meeting");
  });
});

describe("Conflicts", () => {
  it("GET /api/calendar/conflicts should return conflicts list", async () => {
    const { status, json } = await request(app, "GET", "/api/calendar/conflicts", {
      token,
    });

    expect(status).toBe(200);
    expect(json.conflicts).toBeDefined();
  });
});

describe("Calendar Status", () => {
  it("GET /api/calendar/status should return Google status", async () => {
    const { status, json } = await request(app, "GET", "/api/calendar/status", {
      token,
    });

    expect(status).toBe(200);
    expect(json.connected).toBe(false);
  });
});
