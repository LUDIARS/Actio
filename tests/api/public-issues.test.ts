import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Hono } from "hono";
import { initTestDatabase, clearTestDatabase, insertTestUser, generateTestToken, request } from "../helpers.js";

type Repository = typeof import("../../src/db/repository.js");
type PublicRoutes = typeof import("../../modules/public-issues/routes.js");

let app: Hono;
let token: string;
let taskRepo: Repository["taskRepo"];
let createPublicIssueRoutes: PublicRoutes["createPublicIssueRoutes"];

beforeAll(async () => {
  // The test schema must exist before anything opens the database connection.
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
  ({ taskRepo } = await import("../../src/db/repository.js"));
  ({ createPublicIssueRoutes } = await import("../../modules/public-issues/routes.js"));
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: "user-1", name: "IssueUser", email: "issue@test.com" });
  token = generateTestToken("user-1");
});

async function createTask(body: Record<string, unknown>) {
  const { status, json } = await request(app, "POST", "/api/tasks", { token, body });
  expect(status).toBe(201);
  return json.task as { id: string; kind: string; publicHidden: boolean; publicSummary: string | null };
}

describe("task kind issue and public fields", () => {
  it("creates and updates an issue with public_hidden / public_summary", async () => {
    const task = await createTask({ title: "保存できない", kind: "issue", publicSummary: "保存ボタンが反応しない" });
    expect(task.kind).toBe("issue");
    expect(task.publicHidden).toBe(false);
    expect(task.publicSummary).toBe("保存ボタンが反応しない");
    const { status, json } = await request(app, "PATCH", `/api/tasks/${task.id}`, { token, body: { public_hidden: true } });
    expect(status).toBe(200);
    expect(json.task.publicHidden).toBe(true);
  });

  it("rejects a malformed public_hidden", async () => {
    const { status } = await request(app, "POST", "/api/tasks", { token, body: { title: "x", kind: "issue", publicHidden: "yes" } });
    expect(status).toBe(400);
  });

  it("accepts source concordia.bounty.v1 and keeps source/sourceRef idempotent", async () => {
    const body = { title: "ログインで 500", kind: "issue", source: "concordia.bounty.v1", sourceRef: "r-1" };
    const first = await request(app, "POST", "/api/tasks", { token, body });
    expect(first.status).toBe(201);
    const again = await request(app, "POST", "/api/tasks", { token, body });
    expect(again.status).toBe(200);
    expect(again.json.task.id).toBe(first.json.task.id);
  });
});

describe("GET /api/public/issues", () => {
  it("is reachable without authentication and shows nothing when Cc is not configured", async () => {
    const { status, json } = await request(app, "GET", "/api/public/issues");
    expect(status).toBe(200);
    expect(json).toEqual({ projects: [] });
  });

  it("lists only visible issues of a public project from the database", async () => {
    await createTask({ title: "公開するイシュー", kind: "issue", projectId: "At", description: "本文 (公開しない)", requirements: "要件 (公開しない)" });
    await createTask({ title: "非公開のイシュー", kind: "issue", projectId: "At", publicHidden: true });
    await createTask({ title: "通常のタスク", projectId: "At" });
    await createTask({ title: "別プロジェクト", kind: "issue", projectId: "Secret" });
    await createTask({ title: "バウンティ", kind: "issue", projectId: "At", source: "concordia.bounty.v1", sourceRef: "r-1" });
    const routes = createPublicIssueRoutes({
      cc: {
        publicProjectCodes: async () => ["At"],
        publicReports: async () => [{
          reportId: "r-1", title: "ログインで 500", summary: null, severity: "s2", status: "deployed",
          publicName: "neco", rewardTokens: 100, receivedAt: null, deployedAt: null,
        }],
      },
      tasks: {
        findPublicIssues: (code) => taskRepo.findPublicIssues(code),
        findBySourceRefs: (source, refs) => taskRepo.findBySourceRefs(source, refs),
      },
    });
    const res = await routes.request("/issues");
    const json = await res.json() as { projects: Array<{ project: string; bounty: { available: boolean; issues?: Array<{ taskStatus: string | null }> }; issues: Array<{ title: string }> }> };
    expect(json.projects.map((p) => p.project)).toEqual(["At"]);
    expect(json.projects[0].issues.map((i) => i.title)).toEqual(["公開するイシュー"]);
    expect(json.projects[0].bounty.issues?.[0].taskStatus).toBe("open");
    const serialized = JSON.stringify(json);
    for (const leaked of ["本文", "要件", "user-1", "非公開のイシュー", "通常のタスク", "別プロジェクト"]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});
