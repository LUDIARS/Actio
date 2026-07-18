/**
 * 外部API tasks スコープ (GLAB×Calliope PM 連携)
 *
 * project_id (GLAB glab_project.id 等の不透明参照) 指定タスクの
 * read/write を api_clients トークンで行えることを検証する。
 * 2026-07-17 neco 最終裁定 / spec/tasks/2026-07-17-01-glab-project-tasks.md
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  insertTestApiClient,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;
let tasksScopeSecret: string;
let noTasksScopeSecret: string;

const TASKS_CLIENT_ID = "client-glab-tasks";
const OTHER_CLIENT_ID = "client-glab-calendar-only";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(async () => {
  clearTestDatabase();
  insertTestUser({ id: "svc-glab", name: "GLAB Service", email: "glab-svc@test.com" });
  insertTestUser({ id: "student-1", name: "Student One", email: "student1@test.com" });
  insertTestUser({ id: "student-2", name: "Student Two", email: "student2@test.com" });

  const withTasks = insertTestApiClient({
    id: "apiclient-1",
    userId: "svc-glab",
    clientId: TASKS_CLIENT_ID,
    scopes: ["tasks"],
  });
  tasksScopeSecret = withTasks.clientSecret;

  const withoutTasks = insertTestApiClient({
    id: "apiclient-2",
    userId: "svc-glab",
    clientId: OTHER_CLIENT_ID,
    scopes: ["calendar"],
  });
  noTasksScopeSecret = withoutTasks.clientSecret;
});

function tasksAuthHeaders() {
  return { "X-API-Client-ID": TASKS_CLIENT_ID, "X-API-Client-Secret": tasksScopeSecret };
}

describe("GET /api/external/tasks", () => {
  it("rejects requests without API key headers", async () => {
    const { status } = await request(app, "GET", "/api/external/tasks?project=proj-1");
    expect(status).toBe(401);
  });

  it("rejects clients without the tasks scope", async () => {
    const { status, json } = await request(app, "GET", "/api/external/tasks?project=proj-1", {
      headers: { "X-API-Client-ID": OTHER_CLIENT_ID, "X-API-Client-Secret": noTasksScopeSecret },
    });
    expect(status).toBe(403);
    expect(json.error).toBe("Insufficient scope");
  });

  it("requires the project query parameter", async () => {
    const { status, json } = await request(app, "GET", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
    });
    expect(status).toBe(400);
    expect(json.error).toContain("project");
  });

  it("lists only tasks belonging to the given project", async () => {
    await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "task A", ownerId: "student-1" },
    });
    await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "task B", ownerId: "student-2" },
    });
    await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-2", title: "task C", ownerId: "student-1" },
    });

    const { status, json } = await request(app, "GET", "/api/external/tasks?project=proj-1", {
      headers: tasksAuthHeaders(),
    });
    expect(status).toBe(200);
    expect(json.tasks.length).toBe(2);
    expect(json.tasks.map((t: { title: string }) => t.title).sort()).toEqual(["task A", "task B"]);
  });
});

describe("POST /api/external/tasks", () => {
  it("creates a task scoped to a project", async () => {
    const { status, json } = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "New GLAB task", ownerId: "student-1", estimatedMinutes: 45 },
    });
    expect(status).toBe(201);
    expect(json.task.projectId).toBe("proj-1");
    expect(json.task.ownerId).toBe("student-1");
    expect(json.task.title).toBe("New GLAB task");
    expect(json.task.status).toBe("open");
    expect(json.task.priority).toBe("medium");
    expect(json.task.estimatedMinutes).toBe(45);
  });

  it("accepts snake_case project_id alias", async () => {
    const { status, json } = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { project_id: "proj-snake", title: "snake case", ownerId: "student-1" },
    });
    expect(status).toBe(201);
    expect(json.task.projectId).toBe("proj-snake");
  });

  it("rejects missing projectId", async () => {
    const { status, json } = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { title: "no project", ownerId: "student-1" },
    });
    expect(status).toBe(400);
    expect(json.error).toContain("projectId");
  });

  it("rejects missing title", async () => {
    const { status } = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", ownerId: "student-1" },
    });
    expect(status).toBe(400);
  });

  it("rejects missing ownerId", async () => {
    const { status, json } = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "no owner" },
    });
    expect(status).toBe(400);
    expect(json.error).toContain("ownerId");
  });

  it("rejects invalid priority", async () => {
    const { status } = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "t", ownerId: "student-1", priority: "urgent" },
    });
    expect(status).toBe(400);
  });
});

describe("GET /api/external/tasks/:id", () => {
  it("returns a project task", async () => {
    const create = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "fetch me", ownerId: "student-1" },
    });
    const id = create.json.task.id;

    const { status, json } = await request(app, "GET", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
    });
    expect(status).toBe(200);
    expect(json.task.id).toBe(id);
  });

  it("404s for tasks that have no project_id (personal tasks are out of scope)", async () => {
    const token = generateTestToken("student-1");
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "personal task, not GLAB" },
    });
    const id = create.json.task.id;

    const { status } = await request(app, "GET", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
    });
    expect(status).toBe(404);
  });

  it("404s for unknown id", async () => {
    const { status } = await request(app, "GET", "/api/external/tasks/nonexistent", {
      headers: tasksAuthHeaders(),
    });
    expect(status).toBe(404);
  });
});

describe("PUT /api/external/tasks/:id", () => {
  async function createProjectTask() {
    const create = await request(app, "POST", "/api/external/tasks", {
      headers: tasksAuthHeaders(),
      body: { projectId: "proj-1", title: "update me", ownerId: "student-1" },
    });
    return create.json.task.id as string;
  }

  it("updates status and sets completedAt", async () => {
    const id = await createProjectTask();
    const { status, json } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: { status: "done" },
    });
    expect(status).toBe(200);
    expect(json.task.status).toBe("done");
    expect(json.task.completedAt).toBeTruthy();
  });

  it("updates priority", async () => {
    const id = await createProjectTask();
    const { status, json } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: { priority: "high" },
    });
    expect(status).toBe(200);
    expect(json.task.priority).toBe("high");
  });

  it("updates estimatedMinutes", async () => {
    const id = await createProjectTask();
    const { status, json } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: { estimatedMinutes: 120 },
    });
    expect(status).toBe(200);
    expect(json.task.estimatedMinutes).toBe(120);
  });

  it("rejects invalid status", async () => {
    const id = await createProjectTask();
    const { status } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: { status: "bogus" },
    });
    expect(status).toBe(400);
  });

  it("rejects invalid priority", async () => {
    const id = await createProjectTask();
    const { status } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: { priority: "urgent" },
    });
    expect(status).toBe(400);
  });

  it("rejects empty update body", async () => {
    const id = await createProjectTask();
    const { status } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: {},
    });
    expect(status).toBe(400);
  });

  it("404s for tasks without project_id", async () => {
    const token = generateTestToken("student-1");
    const create = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "personal task" },
    });
    const id = create.json.task.id;

    const { status } = await request(app, "PUT", `/api/external/tasks/${id}`, {
      headers: tasksAuthHeaders(),
      body: { status: "done" },
    });
    expect(status).toBe(404);
  });
});
