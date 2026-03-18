import { describe, it, expect, beforeAll } from "vitest";
import { initTestDatabase, request } from "../helpers.js";

let app: any;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp();
});

describe("GET /", () => {
  it("should return app info", async () => {
    const { status, json } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(json.name).toBe("Schedula");
    expect(json.version).toBe("1.0.0");
    expect(json.core).toBeDefined();
    expect(json.modules).toBeDefined();
  });
});

describe("GET /api/health", () => {
  it("should return health status", async () => {
    const { status, json } = await request(app, "GET", "/api/health");

    expect(status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.db_status).toBe("connected");
  });
});

describe("GET /api/timetable", () => {
  it("should return timetable structure", async () => {
    const { status, json } = await request(app, "GET", "/api/timetable");

    expect(status).toBe(200);
    expect(json.days).toBeDefined();
    expect(json.days.length).toBe(7);
    expect(json.periods).toBeDefined();
    expect(json.periods.length).toBe(11);
  });
});
