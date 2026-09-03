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

let app: any;
beforeAll(async () => { initTestDatabase(); app = (await import("../../src/app.js")).createApp().app; });
beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: "user-1", name: "User", email: "user@example.test" });
  insertTestUser({ id: "user-2", name: "Other", email: "other@example.test" });
  insertTestUser({ id: "admin-1", name: "Admin", email: "admin@example.test", role: "admin" });
  insertTestTeamRef({ id: "team-1", settings: { input_mode: "minimal" } });
  insertTestTeamMember({ teamId: "team-1", userId: "user-1" });
});

describe("team lane routes", () => {
  it("lists tasks by team and lane", async () => {
    const token = generateTestToken("user-1");
    const created = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "team task", team_id: "team-1", assigneeId: "user-1", duration_days: 2 },
    });
    expect(created.status).toBe(201);
    const listed = await request(app, "GET", "/api/tasks?team_id=team-1&lane=backlog", { token });
    expect(listed.status).toBe(200);
    expect(listed.json.tasks).toHaveLength(1);
    expect(listed.json.tasks[0].id).toBe(created.json.task.id);
  });

  it("rejects team lists for non-members", async () => {
    const listed = await request(app, "GET", "/api/tasks?team_id=team-1", {
      token: generateTestToken("user-2"),
    });
    expect(listed.status).toBe(403);
  });

  it("allows system admins to list team tasks without a membership row", async () => {
    const listed = await request(app, "GET", "/api/tasks?team_id=team-1", {
      token: generateTestToken("admin-1", "admin"),
    });
    expect(listed.status).toBe(200);
  });

  it("rejects team task creation by non-members", async () => {
    const created = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-2"),
      body: { title: "unauthorized", team_id: "team-1", assigneeId: "user-1" },
    });
    expect(created.status).toBe(403);
  });

  it("moves an owned team task to backlog", async () => {
    const token = generateTestToken("user-1");
    const created = await request(app, "POST", "/api/tasks", {
      token,
      body: { title: "daily", team_id: "team-1", assigneeId: "user-1" },
    });
    const changed = await request(app, "PATCH", `/api/tasks/${created.json.task.id}/lane`, {
      token,
      body: { lane: "backlog", duration_days: 2 },
    });
    expect(changed.status).toBe(200);
    expect(changed.json.task.lane).toBe("backlog");
    expect(changed.json.task.durationDays).toBe(2);
  });

  it("rejects lane changes by non-owner and non-assignee", async () => {
    const created = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: { title: "team task", teamId: "team-1", assigneeId: "user-1", durationDays: 2 },
    });
    const changed = await request(app, "PATCH", `/api/tasks/${created.json.task.id}/lane`, {
      token: generateTestToken("user-2"),
      body: { lane: "daily" },
    });
    expect(changed.status).toBe(403);
  });

  it("does not expose a team task through the direct lookup route", async () => {
    const created = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: { title: "private team task", teamId: "team-1", assigneeId: "user-1" },
    });
    const fetched = await request(app, "GET", `/api/tasks/${created.json.task.id}`, {
      token: generateTestToken("user-2"),
    });
    expect(fetched.status).toBe(403);
    expect(fetched.json.task).toBeUndefined();
  });

  it("enforces full input mode and lane transitions on regular task routes", async () => {
    insertTestTeamRef({ id: "team-full", settings: { input_mode: "full" } });
    insertTestTeamMember({ teamId: "team-full", userId: "user-1" });
    const missingDeadline = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: { title: "full backlog", teamId: "team-full", assigneeId: "user-1", lane: "backlog" },
    });
    expect(missingDeadline.status).toBe(400);

    const daily = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: { title: "daily", teamId: "team-1", assigneeId: "user-1" },
    });
    const invalidTransition = await request(app, "PATCH", `/api/tasks/${daily.json.task.id}`, {
      token: generateTestToken("user-1"),
      body: { lane: "backlog" },
    });
    expect(invalidTransition.status).toBe(400);
  });

  it("validates team fields on the regular update route", async () => {
    const created = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: { title: "team task", teamId: "team-1", assigneeId: "user-1" },
    });
    const changed = await request(app, "PATCH", `/api/tasks/${created.json.task.id}`, {
      token: generateTestToken("user-1"),
      body: { assigneeId: "user-2" },
    });
    expect(changed.status).toBe(400);
    expect(changed.json.error).toContain("team member");
  });

  it("does not disclose another user's idempotent task", async () => {
    const first = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: { title: "private", source: "cc-rwf", source_ref: "opaque-ref" },
    });
    expect(first.status).toBe(201);
    const duplicate = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-2"),
      body: { title: "probe", source: "cc-rwf", source_ref: "opaque-ref" },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.task).toBeUndefined();
  });

  it("returns a team idempotency hit to another authorized team member", async () => {
    insertTestTeamMember({ teamId: "team-1", userId: "user-2" });
    const first = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-1"),
      body: {
        title: "shared",
        teamId: "team-1",
        assigneeId: "user-1",
        source: "cc-taskmd",
        sourceRef: "actio/spec/tasks/shared.md",
      },
    });
    const duplicate = await request(app, "POST", "/api/tasks", {
      token: generateTestToken("user-2"),
      body: {
        title: "retry",
        teamId: "team-1",
        assigneeId: "user-1",
        source: "cc-taskmd",
        sourceRef: "actio/spec/tasks/shared.md",
      },
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.json.task.id).toBe(first.json.task.id);
  });

  it("rejects local absolute paths in source_ref", async () => {
    for (const sourceRef of ["C:\\Users\\me\\task.md", "/home/me/task.md", "file:///tmp/task.md", "https://token@example.test/repo"]) {
      const response = await request(app, "POST", "/api/tasks", {
        token: generateTestToken("user-1"),
        body: { title: "leaky", source: "cc-taskmd", source_ref: sourceRef },
      });
      expect(response.status).toBe(400);
    }
  });
});
