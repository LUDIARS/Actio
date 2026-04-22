/**
 * Issue #111 D3 / D4 — issue_links / comments REST API integration tests
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
  await new Promise((r) => setTimeout(r, 200));
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: "u1", name: "User1", email: "u1@test.com" });
});

describe("Issue #111 D3 — /api/links", () => {
  it("creates a bidirectional blocks/blocked_by pair", async () => {
    const token = generateTestToken("u1");
    const r = await request(app, "POST", "/api/links", {
      token,
      body: {
        fromType: "task", fromId: "task-A",
        toType: "task",   toId:   "task-B",
        linkType: "blocks",
      },
    });
    expect(r.status).toBe(200);

    // A -> B blocks
    const listA = await request(app, "GET", "/api/links/task/task-A", { token });
    expect(listA.status).toBe(200);
    expect(listA.json.outgoing).toHaveLength(1);
    expect(listA.json.outgoing[0].linkType).toBe("blocks");

    // B -> A blocked_by (auto-mirror)
    const listB = await request(app, "GET", "/api/links/task/task-B", { token });
    expect(listB.status).toBe(200);
    const hasInverse = (listB.json.outgoing as Array<{ linkType: string; toId: string }>)
      .some((l) => l.linkType === "blocked_by" && l.toId === "task-A");
    expect(hasInverse).toBe(true);
  });

  it("is idempotent on duplicate POSTs", async () => {
    const token = generateTestToken("u1");
    const body = { fromType: "task", fromId: "x", toType: "task", toId: "y", linkType: "relates_to" };
    const r1 = await request(app, "POST", "/api/links", { token, body });
    const r2 = await request(app, "POST", "/api/links", { token, body });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.json.deduped).toBe(true);
  });

  it("rejects self-links", async () => {
    const token = generateTestToken("u1");
    const r = await request(app, "POST", "/api/links", {
      token,
      body: { fromType: "task", fromId: "x", toType: "task", toId: "x", linkType: "relates_to" },
    });
    expect(r.status).toBe(400);
  });

  it("requires auth", async () => {
    const { status } = await request(app, "GET", "/api/links/task/abc");
    expect(status).toBe(401);
  });
});

describe("Issue #111 D4 — /api/comments", () => {
  it("creates + lists comments", async () => {
    const token = generateTestToken("u1");
    const create = await request(app, "POST", "/api/comments", {
      token,
      body: { targetType: "task", targetId: "t1", body: "hello" },
    });
    expect(create.status).toBe(200);

    const list = await request(app, "GET", "/api/comments/task/t1", { token });
    expect(list.status).toBe(200);
    expect(list.json.comments).toHaveLength(1);
    expect(list.json.comments[0].body).toBe("hello");
  });

  it("only the author can update / delete", async () => {
    insertTestUser({ id: "u2", name: "User2", email: "u2@test.com" });
    const tokenA = generateTestToken("u1");
    const tokenB = generateTestToken("u2");

    const create = await request(app, "POST", "/api/comments", {
      token: tokenA,
      body: { targetType: "task", targetId: "t1", body: "a1" },
    });
    const id = create.json.id;

    const badUpdate = await request(app, "PATCH", `/api/comments/${id}`, {
      token: tokenB,
      body: { body: "hacked" },
    });
    expect(badUpdate.status).toBe(404);

    const okUpdate = await request(app, "PATCH", `/api/comments/${id}`, {
      token: tokenA,
      body: { body: "updated" },
    });
    expect(okUpdate.status).toBe(200);

    const badDelete = await request(app, "DELETE", `/api/comments/${id}`, { token: tokenB });
    expect(badDelete.status).toBe(404);
    const okDelete = await request(app, "DELETE", `/api/comments/${id}`, { token: tokenA });
    expect(okDelete.status).toBe(200);
  });

  it("rejects empty body", async () => {
    const token = generateTestToken("u1");
    const r = await request(app, "POST", "/api/comments", {
      token,
      body: { targetType: "task", targetId: "t1", body: "" },
    });
    expect(r.status).toBe(400);
  });
});

describe("Issue #111 D1 — /api/custom-fields", () => {
  it("rejects unknown field_id (no registration)", async () => {
    const token = generateTestToken("u1");
    const r = await request(app, "PUT", "/api/custom-fields/some-mod/priority/task/t1", {
      token,
      body: { value: "high" },
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/unknown custom field/i);
  });

  it("lists empty definitions when no plugin registered any", async () => {
    const token = generateTestToken("u1");
    const r = await request(app, "GET", "/api/custom-fields/definitions", { token });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.fields)).toBe(true);
  });
});
