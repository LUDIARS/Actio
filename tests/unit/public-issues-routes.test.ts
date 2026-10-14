import { describe, expect, it, vi } from "vitest";
import { createPublicIssueRoutes } from "../../modules/public-issues/routes.js";
import type { PublicIssuesDeps } from "../../modules/public-issues/service.js";
import type { PublicIssueTaskRow } from "../../modules/public-issues/public-view.js";
import type { PublicBountyReport } from "../../modules/public-issues/types.js";
import { isPublicReadRequest } from "../../src/auth/local-mode-policy.js";

const issueRow = {
  id: "t-1", title: "保存できない", publicSummary: "保存ボタンが反応しない", status: "open", priority: "high",
  source: "cc-command", sourceRef: "bug:abc", createdAt: new Date("2026-10-01T00:00:00Z"), completedAt: null,
  description: "本文 (公開しない)", requirements: "要件 (公開しない)", ownerId: "owner-1", assigneeId: "assignee-1",
} as PublicIssueTaskRow;
const bountyRow = { ...issueRow, id: "t-2", source: "concordia.bounty.v1", sourceRef: "r-1", status: "done" } as PublicIssueTaskRow;
const report: PublicBountyReport = {
  reportId: "r-1", title: "ログインで 500", summary: null, severity: "s1", status: "deployed",
  publicName: "neco", rewardTokens: 500, receivedAt: null, deployedAt: null,
};

function deps(overrides: Partial<PublicIssuesDeps["cc"]> = {}) {
  const findPublicIssues = vi.fn(async (code: string) => (code === "At" ? [issueRow, bountyRow] : []));
  const findBySourceRefs = vi.fn(async () => [bountyRow]);
  const value: PublicIssuesDeps = {
    cc: {
      publicProjectCodes: vi.fn(async () => ["At", "Cc"]),
      publicReports: vi.fn(async () => [report]),
      ...overrides,
    },
    tasks: { findPublicIssues, findBySourceRefs },
  };
  return { value, findPublicIssues, findBySourceRefs };
}

async function get(routes: ReturnType<typeof createPublicIssueRoutes>, path: string, method = "GET") {
  const res = await routes.request(path, { method });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

describe("GET /api/public/issues", () => {
  it("lists bounty rows and non-bounty issues without private task fields", async () => {
    const { value } = deps();
    const { status, json } = await get(createPublicIssueRoutes(value), "/issues?project=At");
    expect(status).toBe(200);
    expect(json).toEqual({
      projects: [{
        project: "At",
        bounty: { available: true, issues: [{ ...report, taskStatus: "done" }] },
        issues: [{ id: "t-1", title: "保存できない", summary: "保存ボタンが反応しない", status: "open", priority: "high", createdAt: "2026-10-01T00:00:00.000Z", completedAt: null }],
      }],
    });
    const serialized = JSON.stringify(json);
    for (const leaked of ["本文", "要件", "owner-1", "assignee-1", "description", "requirements", "bug:abc"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("shows bounty as unavailable when Cc cannot return reports", async () => {
    const { value, findBySourceRefs } = deps({ publicReports: vi.fn(async () => null) });
    const { json } = await get(createPublicIssueRoutes(value), "/issues?project=At");
    const [project] = (json?.projects ?? []) as Array<{ bounty: unknown; issues: unknown[] }>;
    expect(project.bounty).toEqual({ available: false });
    expect(project.issues).toHaveLength(1);
    expect(findBySourceRefs).not.toHaveBeenCalled();
  });

  it("shows nothing when the public project list cannot be read", async () => {
    const { value, findPublicIssues } = deps({ publicProjectCodes: vi.fn(async () => null) });
    const { status, json } = await get(createPublicIssueRoutes(value), "/issues");
    expect(status).toBe(200);
    expect(json).toEqual({ projects: [] });
    expect(findPublicIssues).not.toHaveBeenCalled();
  });

  it("does not read tasks of a project that is not public", async () => {
    const { value, findPublicIssues } = deps();
    const { json } = await get(createPublicIssueRoutes(value), "/issues?project=Secret");
    expect(json).toEqual({ projects: [] });
    expect(findPublicIssues).not.toHaveBeenCalled();
  });

  it("validates project as a project code", async () => {
    const { value } = deps();
    const { status } = await get(createPublicIssueRoutes(value), `/issues?project=${encodeURIComponent("At' OR 1=1")}`);
    expect(status).toBe(400);
  });

  it("accepts GET only", async () => {
    const { value } = deps();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await get(createPublicIssueRoutes(value), "/issues", method)).status).toBe(405);
    }
  });
});

describe("isPublicReadRequest", () => {
  it("lets only GET/HEAD of the public issue list past the local-mode boundary", () => {
    expect(isPublicReadRequest("GET", "/api/public/issues")).toBe(true);
    expect(isPublicReadRequest("HEAD", "/api/public/issues")).toBe(true);
    expect(isPublicReadRequest("POST", "/api/public/issues")).toBe(false);
    expect(isPublicReadRequest("GET", "/api/public/issues/")).toBe(false);
    expect(isPublicReadRequest("GET", "/api/tasks")).toBe(false);
    expect(isPublicReadRequest("GET", "/api/public/other")).toBe(false);
  });
});
