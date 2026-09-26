import Database from "better-sqlite3";
import type { Context } from "hono";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTestDatabase,
  generateTestToken,
  initTestDatabase,
  insertTestTeamMember,
  insertTestTeamRef,
  request,
} from "../helpers.js";

// app.request() has no socket, so the local-mode boundary cannot classify it; a test header stands in for
// the access kind that the boundary would have recorded for a real loopback / Cloudflare Access request.
vi.mock("../../src/auth/local-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/local-mode.js")>();
  const accessFromHeader = (c: Context) => {
    const value = c.req.header("x-test-local-access");
    return value === "loopback" || value === "cf-access" ? value : null;
  };
  return { ...actual, localAccessKind: accessFromHeader, isLocalModeRequest: (c: Context) => accessFromHeader(c) !== null };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

const LOOPBACK = { "x-test-local-access": "loopback" };
const CF_ACCESS = { "x-test-local-access": "cf-access" };

function sqlite(): Database.Database {
  return new Database(process.env.DATABASE_PATH || resolve("data", "test.db"));
}

function insertProjectRef(code: string, teamIds: string[], removedAt: number | null = null): void {
  const db = sqlite();
  db.prepare("INSERT INTO project_refs (code, name, team_ids, synced_at, removed_at) VALUES (?, ?, ?, ?, ?)")
    .run(code, code, JSON.stringify(teamIds), Math.floor(Date.now() / 1000), removedAt);
  db.close();
}

function insertSprint(id: string, teamId: string, status: string, startsOn: string): void {
  const db = sqlite();
  db.prepare(`INSERT INTO sprints (id, team_id, name, goal, starts_on, ends_on, original_ends_on, buffer_ends_on,
    cadence_days, status, capacity_minutes, created_by, created_at, updated_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 14, ?, 4800, 'user-1', 0, 0, 2)`)
    .run(id, teamId, `Sprint ${id}`, `goal ${id}`, startsOn, "2026-10-05", "2026-10-05", "2026-10-07", status);
  db.close();
}

function insertTask(id: string, data: { sprintId: string | null; projectId: string | null; status?: string; deadline?: number | null }): void {
  const db = sqlite();
  db.prepare(`INSERT INTO tasks (id, owner_id, assignee_id, team_id, lane, sprint_id, title, description, status,
    project_id, deadline, estimated_minutes, created_at, updated_at)
    VALUES (?, 'user-1', 'user-1', 'team-1', 'backlog', ?, ?, 'secret description', ?, ?, ?, 30, 0, 0)`)
    .run(id, data.sprintId, `secret title ${id}`, data.status ?? "open", data.projectId, data.deadline ?? null);
  db.close();
}

beforeAll(async () => {
  initTestDatabase();
  app = (await import("../../src/app.js")).createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
  insertTestTeamRef({ id: "team-1", name: "KonbiniDominant" });
  insertTestTeamMember({ teamId: "team-1", userId: "member-1", role: "leader" });
  insertProjectRef("KD", ["team-1"]);
  insertSprint("sprint-active", "team-1", "active", "2026-09-22");
  insertSprint("sprint-next", "team-1", "planning", "2026-10-06");
  insertTask("task-a", { sprintId: "sprint-active", projectId: "KD", deadline: 1_600_000_000 });
  insertTask("task-b", { sprintId: "sprint-active", projectId: "Other", status: "done" });
  insertTask("task-c", { sprintId: null, projectId: "KD" });
});

describe("GET /api/projects/cc/:code/sprints", () => {
  it("returns the sprint summary to a loopback request without team membership", async () => {
    const res = await request(app, "GET", "/api/projects/cc/KD/sprints", { headers: LOOPBACK });
    expect(res.status).toBe(200);
    expect(res.json.project).toBe("KD");
    expect(res.json.teams).toHaveLength(1);
    expect(res.json.teams[0]).toMatchObject({
      teamId: "team-1", teamName: "KonbiniDominant",
      activeSprint: {
        id: "sprint-active", name: "Sprint sprint-active", goal: "goal sprint-active", status: "active", revision: 2,
        tasks: { total: 2, byStatus: { open: 1, done: 1 }, project: { total: 1, byStatus: { open: 1 } }, overdue: 1,
          byExecutor: { human: 2, ai: 0 }, estimatedMinutes: 60, doneMinutes: 30 },
      },
      planningSprints: [{ id: "sprint-next", name: "Sprint sprint-next", startsOn: "2026-10-06", endsOn: "2026-10-05" }],
      backlogUnassigned: { total: 1, project: 1 },
    });
    const serialized = JSON.stringify(res.json);
    expect(serialized).not.toContain("task-");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("user-1");
  });

  it("allows an Actio admin outside local mode", async () => {
    const res = await request(app, "GET", "/api/projects/cc/KD/sprints", { token: generateTestToken("admin-1", "admin") });
    expect(res.status).toBe(200);
  });

  it("rejects Cloudflare Access requests, even with an admin token", async () => {
    expect((await request(app, "GET", "/api/projects/cc/KD/sprints", { headers: CF_ACCESS })).status).toBe(403);
    const withToken = await request(app, "GET", "/api/projects/cc/KD/sprints", { headers: CF_ACCESS, token: generateTestToken("admin-1", "admin") });
    expect(withToken.status).toBe(403);
  });

  it("rejects anonymous requests and ordinary users, including team leaders", async () => {
    expect((await request(app, "GET", "/api/projects/cc/KD/sprints")).status).toBe(403);
    expect((await request(app, "GET", "/api/projects/cc/KD/sprints", { token: generateTestToken("member-1") })).status).toBe(403);
  });

  it("returns 403 before revealing whether a code exists", async () => {
    expect((await request(app, "GET", "/api/projects/cc/Zz/sprints")).status).toBe(403);
  });

  it("returns 404 unknown_project for codes missing from GET /api/projects/cc", async () => {
    insertProjectRef("Gone", ["team-1"], Math.floor(Date.now() / 1000));
    for (const code of ["Zz", "Gone", "kd"]) {
      const res = await request(app, "GET", `/api/projects/cc/${code}/sprints`, { headers: LOOPBACK });
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ error: "unknown_project" });
    }
  });

  it("returns an empty team list for a project without teams", async () => {
    insertProjectRef("Solo", []);
    const res = await request(app, "GET", "/api/projects/cc/Solo/sprints", { headers: LOOPBACK });
    expect(res.status).toBe(200);
    expect(res.json.teams).toEqual([]);
  });
});
