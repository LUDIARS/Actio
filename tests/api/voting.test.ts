import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;

const USER_ID = "user-vote-1";
const USER2_ID = "user-vote-2";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp();
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: USER_ID, name: "VoteUser", email: "vote@test.com" });
  insertTestUser({ id: USER2_ID, name: "VoteUser2", email: "vote2@test.com" });
});

const token = generateTestToken(USER_ID);
const token2 = generateTestToken(USER2_ID);

describe("POST /api/voting/events", () => {
  it("should create a voting event", async () => {
    const { status, json } = await request(app, "POST", "/api/voting/events", {
      token,
      body: {
        title: "Lunch Poll",
        description: "When to eat?",
        candidates: ["月 1限", "火 2限", "水 3限"],
      },
    });

    expect(status).toBe(201);
    expect(json.id).toBeDefined();
    expect(json.title).toBe("Lunch Poll");
    expect(json.candidates.length).toBe(3);
  });

  it("should reject missing title/candidates", async () => {
    const { status } = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "" },
    });

    expect(status).toBe(400);
  });
});

describe("GET /api/voting/events", () => {
  it("should list all events", async () => {
    await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "Event1", candidates: ["A", "B"] },
    });

    const { status, json } = await request(app, "GET", "/api/voting/events", { token });

    expect(status).toBe(200);
    expect(json.events).toBeDefined();
    expect(json.events.length).toBe(1);
    expect(json.events[0].candidates).toBeDefined();
  });
});

describe("GET /api/voting/events/:eventId", () => {
  it("should return event detail with summary", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "DetailEvent", candidates: ["X", "Y"] },
    });

    const { status, json } = await request(app, "GET", `/api/voting/events/${create.json.id}`, { token });

    expect(status).toBe(200);
    expect(json.event).toBeDefined();
    expect(json.event.title).toBe("DetailEvent");
    expect(json.summary).toBeDefined();
    expect(json.responses).toBeDefined();
  });

  it("should 404 for non-existent event", async () => {
    const { status } = await request(app, "GET", "/api/voting/events/nonexistent", { token });
    expect(status).toBe(404);
  });
});

describe("POST /api/voting/events/:eventId/votes", () => {
  it("should submit votes", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "VoteEvent", candidates: ["A", "B"] },
    });

    const candidateIds = create.json.candidates.map((c: any) => c.id);

    const { status, json } = await request(app, "POST", `/api/voting/events/${create.json.id}/votes`, {
      token,
      body: {
        votes: [
          { candidateId: candidateIds[0], answer: "ok" },
          { candidateId: candidateIds[1], answer: "ng" },
        ],
      },
    });

    expect(status).toBe(200);
    expect(json.votes).toBeDefined();
    expect(json.votes.length).toBe(2);
  });

  it("should upsert votes (update existing)", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "UpsertEvent", candidates: ["C"] },
    });

    const candId = create.json.candidates[0].id;

    // First vote
    await request(app, "POST", `/api/voting/events/${create.json.id}/votes`, {
      token,
      body: { votes: [{ candidateId: candId, answer: "ok" }] },
    });

    // Update vote
    const { status, json } = await request(app, "POST", `/api/voting/events/${create.json.id}/votes`, {
      token,
      body: { votes: [{ candidateId: candId, answer: "ng" }] },
    });

    expect(status).toBe(200);

    // Verify in detail
    const detail = await request(app, "GET", `/api/voting/events/${create.json.id}`, { token });
    expect(detail.json.summary[candId].ng).toBe(1);
    expect(detail.json.summary[candId].ok).toBe(0);
  });
});

describe("PUT /api/voting/events/:eventId", () => {
  it("should update event (creator only)", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "UpdateEvent", candidates: ["D"] },
    });

    const { status, json } = await request(app, "PUT", `/api/voting/events/${create.json.id}`, {
      token,
      body: { status: "closed" },
    });

    expect(status).toBe(200);
    expect(json.message).toBe("Updated");
  });

  it("should reject non-creator", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "OtherEvent", candidates: ["E"] },
    });

    const { status } = await request(app, "PUT", `/api/voting/events/${create.json.id}`, {
      token: token2,
      body: { status: "closed" },
    });

    expect(status).toBe(403);
  });
});

describe("DELETE /api/voting/events/:eventId", () => {
  it("should delete event and related data", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "DeleteEvent", candidates: ["F", "G"] },
    });

    const { status, json } = await request(app, "DELETE", `/api/voting/events/${create.json.id}`, {
      token,
    });

    expect(status).toBe(200);
    expect(json.message).toBe("Deleted");

    // Verify deleted
    const { status: getStatus } = await request(app, "GET", `/api/voting/events/${create.json.id}`, { token });
    expect(getStatus).toBe(404);
  });

  it("should reject non-creator", async () => {
    const create = await request(app, "POST", "/api/voting/events", {
      token,
      body: { title: "NoDelete", candidates: ["H"] },
    });

    const { status } = await request(app, "DELETE", `/api/voting/events/${create.json.id}`, {
      token: token2,
    });

    expect(status).toBe(403);
  });
});
