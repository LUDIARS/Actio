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

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(async () => {
  clearTestDatabase();
  insertTestUser({ id: "user-1", name: "PlanUser", email: "plan@test.com" });
  token = generateTestToken("user-1");
});

describe("GET /api/myplans", () => {
  it("should return empty list initially", async () => {
    const { status, json } = await request(app, "GET", "/api/myplans", { token });

    expect(status).toBe(200);
    expect(json.plans).toBeDefined();
    expect(json.plans.length).toBe(0);
  });
});

describe("POST /api/myplans", () => {
  it("should create a my plan", async () => {
    const { status, json } = await request(app, "POST", "/api/myplans", {
      token,
      body: {
        name: "Weekly Routine",
        weeklySchedule: {
          "0": [{ startTime: "09:30", endTime: "10:30", title: "Morning Study" }],
        },
      },
    });

    expect(status).toBe(201);
    expect(json.plan).toBeDefined();
    expect(json.plan.name).toBe("Weekly Routine");
  });
});

describe("PUT /api/myplans/:id", () => {
  it("should update a my plan", async () => {
    const create = await request(app, "POST", "/api/myplans", {
      token,
      body: { name: "Original", weeklySchedule: {} },
    });

    const { status, json } = await request(app, "PUT", `/api/myplans/${create.json.plan.id}`, {
      token,
      body: { name: "Updated" },
    });

    expect(status).toBe(200);
    expect(json.plan.name).toBe("Updated");
  });
});

describe("DELETE /api/myplans/:id", () => {
  it("should delete a my plan", async () => {
    const create = await request(app, "POST", "/api/myplans", {
      token,
      body: { name: "ToDelete", weeklySchedule: {} },
    });

    const { status } = await request(app, "DELETE", `/api/myplans/${create.json.plan.id}`, {
      token,
    });

    expect(status).toBe(200);

    // Verify deleted
    const list = await request(app, "GET", "/api/myplans", { token });
    expect(list.json.plans.length).toBe(0);
  });
});
