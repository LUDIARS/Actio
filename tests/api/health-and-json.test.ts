import { beforeAll, describe, expect, it } from "vitest";
import { generateTestToken, initTestDatabase, request } from "../helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeAll(async () => {
  initTestDatabase();
  app = (await import("../../src/app.js")).createApp().app;
});

describe("health contract", () => {
  it("names the running version on both health endpoints", async () => {
    const live = await request(app, "GET", "/api/health/live", {});
    expect(live.status).toBe(200);
    expect(live.json.version).toMatch(/\S/);
    const ready = await request(app, "GET", "/api/health", {});
    expect(ready.json.service).toBe("actio");
    expect(ready.json.version).toBe(live.json.version);
  });
});

describe("malformed request bodies", () => {
  it("answers 400 instead of 500 when the body is not JSON", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${generateTestToken("user-1")}` },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_json" });
  });
});
