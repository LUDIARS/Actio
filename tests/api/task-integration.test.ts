import Database from "better-sqlite3";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearTestDatabase,
  generateTestToken,
  initTestDatabase,
  insertTestTeamMember,
  insertTestTeamRef,
  insertTestUser,
  request,
} from "../helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

function sqlite(): Database.Database {
  return new Database(process.env.DATABASE_PATH || resolve("data", "test.db"));
}

function insertProjectRef(code: string, teamIds: string[]): void {
  const db = sqlite();
  db.prepare("INSERT INTO project_refs (code, name, team_ids, synced_at, removed_at) VALUES (?, ?, ?, ?, NULL)")
    .run(code, code, JSON.stringify(teamIds), Date.now());
  db.close();
}

function notificationRows(): { event: string; channel: string; team_id: string | null; status: string }[] {
  const db = sqlite();
  const rows = db.prepare("SELECT event, channel, team_id, status FROM task_notifications ORDER BY created_at").all() as
    { event: string; channel: string; team_id: string | null; status: string }[];
  db.close();
  return rows;
}

beforeAll(async () => {
  initTestDatabase();
  app = (await import("../../src/app.js")).createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: "user-1", name: "User", email: "user@example.test" });
  insertTestUser({ id: "user-2", name: "Member", email: "member@example.test" });
  insertTestTeamRef({ id: "team-1", settings: { input_mode: "minimal" } });
  insertTestTeamRef({ id: "team-2", settings: { input_mode: "minimal" } });
  insertTestTeamMember({ teamId: "team-1", userId: "user-1", role: "leader" });
  insertTestTeamMember({ teamId: "team-1", userId: "user-2" });
});

async function createTeamTask(body: Record<string, unknown>, token = generateTestToken("user-1")) {
  return request(app, "POST", "/api/tasks", { token, body: { team_id: "team-1", assigneeId: "user-1", duration_days: 1, ...body } });
}

describe("executor type", () => {
  it("stores AI work with its executor and filters by executor_type", async () => {
    const token = generateTestToken("user-1");
    const ai = await createTeamTask({ title: "AI 実装", executor_type: "ai", ai_executor: "codex/impl-from-design" });
    expect(ai.status).toBe(201);
    expect(ai.json.task).toMatchObject({ executorType: "ai", aiExecutor: "codex/impl-from-design" });
    await createTeamTask({ title: "人間レビュー" });
    const listed = await request(app, "GET", "/api/tasks?team_id=team-1&executor_type=ai", { token });
    expect(listed.json.tasks.map((t: { title: string }) => t.title)).toEqual(["AI 実装"]);
  });

  it("rejects an AI executor label on human work", async () => {
    const res = await createTeamTask({ title: "x", executor_type: "human", ai_executor: "codex" });
    expect(res.status).toBe(400);
  });

  it("clears the AI label when switched back to human", async () => {
    const token = generateTestToken("user-1");
    const ai = await createTeamTask({ title: "AI", executor_type: "ai", ai_executor: "opus" });
    const updated = await request(app, "PATCH", `/api/tasks/${ai.json.task.id}`, { token, body: { executor_type: "human" } });
    expect(updated.status).toBe(200);
    expect(updated.json.task).toMatchObject({ executorType: "human", aiExecutor: null });
  });
});

describe("critical path", () => {
  it("marks the dependency chain and exposes slack through the API", async () => {
    const token = generateTestToken("user-1");
    const a = await createTeamTask({ title: "A", duration_days: 2 });
    const b = await createTeamTask({ title: "B", duration_days: 2, blocked_by: [a.json.task.id] });
    const c = await createTeamTask({ title: "C", duration_days: 2, blocked_by: [b.json.task.id] });
    const d = await createTeamTask({ title: "D", duration_days: 1 });
    const res = await request(app, "GET", "/api/teams/team-1/critical-path", { token });
    expect(res.status).toBe(200);
    expect(res.json.taskIds).toEqual([a.json.task.id, b.json.task.id, c.json.task.id]);
    expect(res.json.tasks.find((t: { id: string }) => t.id === d.json.task.id).slackDays).toBe(5);
    const stored = await request(app, "GET", `/api/tasks/${d.json.task.id}`, { token });
    expect(stored.json.task).toMatchObject({ isCriticalPath: false, slackDays: 5 });
    const storedA = await request(app, "GET", `/api/tasks/${a.json.task.id}`, { token });
    expect(storedA.json.task.isCriticalPath).toBe(true);
  });
});

describe("current sprint view", () => {
  it("shows unassigned backlog and hides daily work, with no active sprint", async () => {
    const token = generateTestToken("user-1");
    await createTeamTask({ title: "backlog" });
    await request(app, "POST", "/api/tasks", { token, body: { title: "daily", team_id: "team-1", assigneeId: "user-1" } });
    const res = await request(app, "GET", "/api/tasks?team_id=team-1&view=current_sprint", { token });
    expect(res.status).toBe(200);
    expect(res.json.current_sprint).toBeNull();
    expect(res.json.tasks.map((t: { title: string }) => t.title)).toEqual(["backlog"]);
  });

  it("requires team_id", async () => {
    const res = await request(app, "GET", "/api/tasks?view=current_sprint", { token: generateTestToken("user-1") });
    expect(res.status).toBe(400);
  });
});

describe("notifications outbox", () => {
  it("queues a Cc notification once when a team task is assigned to someone else", async () => {
    const token = generateTestToken("user-1");
    const created = await createTeamTask({ title: "割り当て" });
    await request(app, "PATCH", `/api/tasks/${created.json.task.id}`, { token, body: { assigneeId: "user-2" } });
    const rows = notificationRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "task.assigned", channel: "concordia", team_id: "team-1", status: "pending" });
  });

  it("routes personal task completion to Memoria", async () => {
    const token = generateTestToken("user-1");
    const created = await request(app, "POST", "/api/tasks", { token, body: { title: "個人" } });
    await request(app, "PATCH", `/api/tasks/${created.json.task.id}`, { token, body: { status: "done" } });
    expect(notificationRows()).toEqual([expect.objectContaining({ event: "task.completed", channel: "memoria", team_id: null })]);
  });

  it("lists failed notifications for admins only", async () => {
    expect((await request(app, "GET", "/api/tasks/notifications", { token: generateTestToken("user-1") })).status).toBe(403);
    expect((await request(app, "GET", "/api/tasks/notifications?status=failed", { token: generateTestToken("user-1", "admin") })).status).toBe(200);
  });
});

describe("Cc project link", () => {
  it("accepts only projects that belong to the task's team", async () => {
    insertProjectRef("At", ["team-1"]);
    insertProjectRef("Mm", ["team-2"]);
    expect((await createTeamTask({ title: "ok", project_id: "At" })).status).toBe(201);
    expect((await createTeamTask({ title: "foreign", project_id: "Mm" })).status).toBe(400);
    expect((await createTeamTask({ title: "unknown", project_id: "Zz" })).status).toBe(400);
  });

  it("keeps opaque project ids on personal tasks", async () => {
    const res = await request(app, "POST", "/api/tasks", { token: generateTestToken("user-1"), body: { title: "glab", project_id: "glab-project-1" } });
    expect(res.status).toBe(201);
  });

  it("lists the team's Cc projects", async () => {
    insertProjectRef("At", ["team-1"]);
    insertProjectRef("Mm", ["team-2"]);
    const res = await request(app, "GET", "/api/teams/team-1/projects", { token: generateTestToken("user-1") });
    expect(res.status).toBe(200);
    expect(res.json.projects).toEqual([{ code: "At", name: "At" }]);
  });
});
