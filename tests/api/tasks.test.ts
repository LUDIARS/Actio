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
  insertTestUser({ id: "user-1", name: "TaskUser", email: "task@test.com" });
  insertTestUser({ id: "user-2", name: "Other", email: "other@test.com" });
  token = generateTestToken("user-1");
});

describe("GET /api/tasks", () => {
  it("should return empty list initially", async () => {
    const { status, json } = await request(app, "GET", "/api/tasks", { token });
    expect(status).toBe(200);
    expect(json.tasks).toEqual([]);
  });

  it("should require authentication", async () => {
    const { status } = await request(app, "GET", "/api/tasks");
    expect(status).toBe(401);
  });
});

describe("POST /api/tasks", () => {
  it("should create a task with defaults", async () => {
    const { status, json } = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "Write report" },
    });

    expect(status).toBe(201);
    expect(json.task.title).toBe("Write report");
    expect(json.task.status).toBe("open");
    expect(json.task.priority).toBe("medium");
    expect(json.task.ownerId).toBe("user-1");
  });

  it("should reject missing title", async () => {
    const { status, json } = await request(app, "POST", "/api/tasks", {
      token,
      body: {},
    });
    expect(status).toBe(400);
    expect(json.error).toContain("title");
  });

  it("should reject invalid status", async () => {
    const { status } = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "t", status: "bogus" },
    });
    expect(status).toBe(400);
  });

  it("should reject invalid priority", async () => {
    const { status } = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "t", priority: "urgent" },
    });
    expect(status).toBe(400);
  });

  it("should accept deadline and estimatedMinutes", async () => {
    const deadline = new Date(Date.now() + 86400_000).toISOString();
    const { status, json } = await request(app, "POST", "/api/tasks", {
      token,
      body: {
        title: "With deadline",
        deadline,
        estimatedMinutes: 90,
        priority: "high",
      },
    });
    expect(status).toBe(201);
    expect(json.task.estimatedMinutes).toBe(90);
    expect(json.task.priority).toBe("high");
    expect(json.task.deadline).toBeDefined();
  });
});

describe("GET /api/tasks/:id", () => {
  it("should fetch a task by id", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "Read me" },
    });
    const id = create.json.task.id;

    const { status, json } = await request(app, "GET", `/api/tasks/${id}`, { token });
    expect(status).toBe(200);
    expect(json.task.id).toBe(id);
  });

  it("should 404 for unknown id", async () => {
    const { status } = await request(app, "GET", "/api/tasks/nonexistent", { token });
    expect(status).toBe(404);
  });
});

describe("PUT /api/tasks/:id", () => {
  it("should update title and status", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "Orig" },
    });
    const id = create.json.task.id;

    const { status, json } = await request(app, "PUT", `/api/tasks/${id}`, {
      token,
      body: { title: "Updated", status: "in_progress" },
    });

    expect(status).toBe(200);
    expect(json.task.title).toBe("Updated");
    expect(json.task.status).toBe("in_progress");
  });

  it("should set completedAt when status -> done", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "t" },
    });
    const id = create.json.task.id;

    const { json } = await request(app, "PUT", `/api/tasks/${id}`, {
      token,
      body: { status: "done" },
    });
    expect(json.task.status).toBe("done");
    expect(json.task.completedAt).toBeTruthy();
  });

  it("should reject non-owner/non-assignee", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "mine" },
    });
    const id = create.json.task.id;

    const otherToken = generateTestToken("user-2");
    const { status } = await request(app, "PUT", `/api/tasks/${id}`, {
      token: otherToken,
      body: { title: "nope" },
    });
    expect(status).toBe(403);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("should delete a task", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "Bye" },
    });
    const id = create.json.task.id;

    const { status } = await request(app, "DELETE", `/api/tasks/${id}`, { token });
    expect(status).toBe(200);

    const get = await request(app, "GET", `/api/tasks/${id}`, { token });
    expect(get.status).toBe(404);
  });

  it("should reject non-owner", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "mine" },
    });
    const id = create.json.task.id;

    const otherToken = generateTestToken("user-2");
    const { status } = await request(app, "DELETE", `/api/tasks/${id}`, {
      token: otherToken,
    });
    expect(status).toBe(403);
  });
});

describe("GET /api/tasks?status=", () => {
  it("should filter by status", async () => {
    await request(app, "POST", "/api/tasks", { token, body: { title: "a" } });
    const b = await request(app, "POST", "/api/tasks", { token, body: { title: "b" } });
    await request(app, "PUT", `/api/tasks/${b.json.task.id}`, {
      token,
      body: { status: "done" },
    });

    const open = await request(app, "GET", "/api/tasks?status=open", { token });
    expect(open.json.tasks.length).toBe(1);
    expect(open.json.tasks[0].title).toBe("a");

    const done = await request(app, "GET", "/api/tasks?status=done", { token });
    expect(done.json.tasks.length).toBe(1);
    expect(done.json.tasks[0].title).toBe("b");
  });
});

describe("GET /api/tasks/plugins", () => {
  it("should return registered task plugins", async () => {
    const { status, json } = await request(app, "GET", "/api/tasks/plugins", { token });
    expect(status).toBe(200);
    expect(Array.isArray(json.plugins)).toBe(true);
  });
});
