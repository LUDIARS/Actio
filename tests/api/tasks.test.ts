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

  // 認証は当面未配線 (ユーザ指示)。 無認証アクセスは既定の個人ユーザ
  // (PERSONAL_USER_ID) にフォールバックし、 その owner のタスクを返す。
  it("falls back to the personal user when unauthenticated", async () => {
    const { status, json } = await request(app, "GET", "/api/tasks");
    expect(status).toBe(200);
    expect(Array.isArray(json.tasks)).toBe(true);
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

// ─── Memoria 個人タスク移植 (kind / category / 互換エイリアス) ──
describe("Personal task fields (Memoria port)", () => {
  it("creates a goal with category, accepts details/due_at aliases", async () => {
    const { status, json } = await request(app, "POST", "/api/tasks", {
      token,
      body: {
        title: "年間目標",
        kind: "goal",
        category: "学習, 開発",
        details: "詳細メモ",
        due_at: "2026-12-31T23:59",
      },
    });
    expect(status).toBe(201);
    expect(json.task.kind).toBe("goal");
    expect(json.task.category).toBe("学習, 開発");
    expect(json.task.description).toBe("詳細メモ");
    expect(json.task.deadline).toBeTruthy();
    expect(json.task.creatorType).toBe("human");
  });

  it("normalizes todo/doing status aliases to open/in_progress", async () => {
    const todo = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "t1", status: "todo" },
    });
    expect(todo.json.task.status).toBe("open");
    const doing = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "t2", status: "doing" },
    });
    expect(doing.json.task.status).toBe("in_progress");
  });

  it("filters by kind and supports all", async () => {
    await request(app, "POST", "/api/tasks", { token, body: { title: "task-a", kind: "task" } });
    await request(app, "POST", "/api/tasks", { token, body: { title: "goal-a", kind: "goal" } });

    const goals = await request(app, "GET", "/api/tasks?kind=goal", { token });
    expect(goals.json.tasks.length).toBe(1);
    expect(goals.json.tasks[0].title).toBe("goal-a");

    const all = await request(app, "GET", "/api/tasks?kind=all", { token });
    expect(all.json.tasks.length).toBe(2);
  });

  it("flips ai creator to human when user edits due_at", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "ai-task", creatorType: "ai" },
    });
    expect(create.json.task.creatorType).toBe("ai");
    const upd = await request(app, "PUT", `/api/tasks/${create.json.task.id}`, {
      token,
      body: { due_at: "2026-07-01T10:00" },
    });
    expect(upd.json.task.creatorType).toBe("human");
  });
});

// ─── Memoria 互換シム (ハブ移行期) ───────────────────────
describe("Memoria compat shim", () => {
  it("accepts snake_case creator_type and returns {items} memoria shape", async () => {
    await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "compat", creator_type: "ai", status: "doing", details: "メモ", category: "Mm" },
    });
    const res = await request(app, "GET", "/api/tasks?format=memoria", { token });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.items)).toBe(true);
    const item = res.json.items.find((t: { title: string }) => t.title === "compat");
    expect(item).toBeTruthy();
    expect(item.status).toBe("doing"); // in_progress → doing
    expect(item.details).toBe("メモ"); // description → details
    expect(item.creator_type).toBe("ai");
    expect(item.category).toBe("Mm");
  });

  it("supports PATCH /:id {status} like Memoria", async () => {
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "patch-me" },
    });
    const id = create.json.task.id;
    const patched = await request(app, "PATCH", `/api/tasks/${id}`, {
      token,
      body: { status: "done" },
    });
    expect(patched.status).toBe(200);
    expect(patched.json.task.status).toBe("done");
    expect(patched.json.task.completedAt).toBeTruthy();
  });
});

describe("Task categories (Memoria port)", () => {
  it("registers, lists, and unregisters categories", async () => {
    const reg = await request(app, "POST", "/api/tasks/categories", {
      token,
      body: { name: "開発" },
    });
    expect(reg.status).toBe(201);
    expect(reg.json.items).toContain("開発");

    // 未完了タスクのカテゴリも union される
    await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "c1", category: "学習" },
    });
    const list = await request(app, "GET", "/api/tasks/categories", { token });
    expect(list.json.items).toContain("開発");
    expect(list.json.items).toContain("学習");

    const del = await request(app, "DELETE", "/api/tasks/categories/開発", { token });
    expect(del.json.items).not.toContain("開発");
  });
});
