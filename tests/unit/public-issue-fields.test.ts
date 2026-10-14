import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { normalizeKind } from "../../modules/task/personal.js";
import { readPublicIssueFields } from "../../modules/task/validation/public-issue-fields.js";
import { validateTeamTaskMetadata, type TeamTaskRequestFields } from "../../modules/task/validation/team-task-request.js";
import { LEGACY_BUG_REPORT_TO_ISSUE_SQL } from "../../src/db/issue-kind-migration.js";

describe("normalizeKind", () => {
  it("keeps issue and goal and maps everything else to task", () => {
    expect(normalizeKind("issue")).toBe("issue");
    expect(normalizeKind("goal")).toBe("goal");
    expect(normalizeKind("bug")).toBe("task");
    expect(normalizeKind(undefined)).toBe("task");
  });
});

describe("readPublicIssueFields", () => {
  it("reads camelCase and snake_case and trims the summary", () => {
    expect(readPublicIssueFields({ publicHidden: true, publicSummary: "  要約  " })).toEqual({ ok: true, value: { publicHidden: true, publicSummary: "要約" } });
    expect(readPublicIssueFields({ public_hidden: false, public_summary: "" })).toEqual({ ok: true, value: { publicHidden: false, publicSummary: null } });
    expect(readPublicIssueFields({})).toEqual({ ok: true, value: {} });
  });

  it("rejects a non-boolean public_hidden and an oversized or non-string summary", () => {
    expect(readPublicIssueFields({ public_hidden: "yes" }).ok).toBe(false);
    expect(readPublicIssueFields({ publicSummary: 3 }).ok).toBe(false);
    expect(readPublicIssueFields({ publicSummary: "x".repeat(1001) }).ok).toBe(false);
  });
});

describe("task source concordia.bounty.v1", () => {
  const fields = (source: string): TeamTaskRequestFields => ({
    teamId: undefined, lane: undefined, sprintId: undefined, durationDays: undefined,
    source, sourceRef: "r-1", blockedBy: undefined, storyPoints: undefined,
  });

  it("is accepted with a sourceRef like the other provenances", () => {
    expect(validateTeamTaskMetadata(fields("concordia.bounty.v1"))).toBeUndefined();
    expect(validateTeamTaskMetadata(fields("unknown.source"))).toMatch(/source must be one of/);
  });
});

describe("LEGACY_BUG_REPORT_TO_ISSUE_SQL", () => {
  it("moves only cc-command bug:* tasks of kind task to issue", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'task', source TEXT, source_ref TEXT)");
    const insert = sqlite.prepare("INSERT INTO tasks (id, kind, source, source_ref) VALUES (?, ?, ?, ?)");
    insert.run("bug", "task", "cc-command", "bug:client-1");
    insert.run("goal-bug", "goal", "cc-command", "bug:client-2");
    insert.run("other-command", "task", "cc-command", "cmd:client-3");
    insert.run("other-source", "task", "cc-taskmd", "bug:client-4");
    insert.run("manual", "task", null, null);
    sqlite.exec(LEGACY_BUG_REPORT_TO_ISSUE_SQL);
    sqlite.exec(LEGACY_BUG_REPORT_TO_ISSUE_SQL);
    const kinds = Object.fromEntries(
      (sqlite.prepare("SELECT id, kind FROM tasks").all() as Array<{ id: string; kind: string }>).map((r) => [r.id, r.kind]),
    );
    expect(kinds).toEqual({ bug: "issue", "goal-bug": "goal", "other-command": "task", "other-source": "task", manual: "task" });
    sqlite.close();
  });
});
