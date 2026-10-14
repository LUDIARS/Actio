import { describe, expect, it } from "vitest";
import { composeProjectIssues, toPublicTaskIssue, type PublicIssueTaskRow } from "../../modules/public-issues/public-view.js";
import type { PublicBountyReport } from "../../modules/public-issues/types.js";

/** DB 行に近い形 (本文・要件・担当者・作成者を含む) をあえて渡し、 公開形で落ちることを固定する */
function row(overrides: Partial<PublicIssueTaskRow> & Record<string, unknown> = {}): PublicIssueTaskRow {
  return {
    id: "t-1",
    title: "保存ボタンが反応しない",
    publicSummary: null,
    status: "open",
    priority: "high",
    source: null,
    sourceRef: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    completedAt: null,
    description: "社内の再現手順: 管理画面で...",
    requirements: "- 秘密の要件",
    ownerId: "user-owner",
    assigneeId: "user-assignee",
    creatorType: "human",
    ...overrides,
  } as PublicIssueTaskRow;
}

const report: PublicBountyReport = {
  reportId: "r-1", title: "ログインで 500", summary: "特定の条件で 500 になる", severity: "s2", status: "deployed",
  publicName: "neco", rewardTokens: 1000, receivedAt: "2026-10-01T00:00:00.000Z", deployedAt: "2026-10-03T00:00:00.000Z",
};

describe("toPublicTaskIssue", () => {
  it("returns only title, public summary, status, priority and timestamps", () => {
    const issue = toPublicTaskIssue(row({ publicSummary: "公開用の要約", completedAt: new Date("2026-10-05T00:00:00Z") }));
    expect(Object.keys(issue).sort()).toEqual(["completedAt", "createdAt", "id", "priority", "status", "summary", "title"]);
    expect(issue.summary).toBe("公開用の要約");
    expect(issue.completedAt).toBe("2026-10-05T00:00:00.000Z");
  });

  it("never exposes body, requirements, assignee or creator", () => {
    const serialized = JSON.stringify(toPublicTaskIssue(row()));
    for (const leaked of ["description", "requirements", "ownerId", "assigneeId", "creatorType", "社内の再現手順", "秘密の要件", "user-owner", "user-assignee"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("does not fall back to the description when no public summary is set", () => {
    expect(toPublicTaskIssue(row()).summary).toBeNull();
  });
});

describe("composeProjectIssues", () => {
  it("puts bounty-sourced tasks on the bounty row only and attaches their status", () => {
    const bountyTask = row({ id: "t-bounty", source: "concordia.bounty.v1", sourceRef: "r-1", status: "done" });
    const result = composeProjectIssues({
      project: "At",
      reports: [report],
      tasks: [row(), bountyTask],
      bountyTasks: [bountyTask],
    });
    expect(result.issues.map((issue) => issue.id)).toEqual(["t-1"]);
    expect(result.bounty).toEqual({ available: true, issues: [{ ...report, taskStatus: "done" }] });
  });

  it("marks the bounty section unavailable when Cc could not be read", () => {
    const result = composeProjectIssues({ project: "At", reports: null, tasks: [row()], bountyTasks: [] });
    expect(result.bounty).toEqual({ available: false });
    expect(result.issues).toHaveLength(1);
  });

  it("leaves taskStatus null when no Actio task matches the report", () => {
    const result = composeProjectIssues({ project: "At", reports: [report], tasks: [], bountyTasks: [] });
    expect(result.bounty.available && result.bounty.issues[0].taskStatus).toBeNull();
  });
});
