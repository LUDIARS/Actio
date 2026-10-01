import { describe, expect, it } from "vitest";
import { decideConflict, applyOverlappingResolution } from "../../modules/pm/domain/conflict-policy.js";
import { githubLabelsFor, githubStateFor } from "../../modules/pm/domain/github-labels.js";
import { buildMergeRequest, parseMergeResponse } from "../../modules/pm/domain/merge-prompt.js";
import { deadlineNotification, externalChangeNotifications, reportReadyNotification } from "../../modules/pm/domain/notifications.js";
import { decideTaskSync, externalChangeType } from "../../modules/pm/domain/sync-plan.js";
import { isSyncDue } from "../../modules/pm/domain/sync-schedule.js";
import { changedFields, toTrackedTask, type TrackedTask } from "../../modules/pm/domain/tracked-task.js";

const base: TrackedTask = {
  title: "ログイン画面",
  description: "本文",
  status: "open",
  priority: "medium",
  assignees: ["alice"],
  labels: ["ui"],
  dueDate: "2026-10-10",
  milestoneExternalId: null,
  milestoneName: null,
};

describe("tracked task", () => {
  it("ignores array order and non-tracked fields", () => {
    const row = toTrackedTask({ ...base, labels: ["ui"], id: "x", dirtyFlag: 1 });
    expect(changedFields(base, { ...row, assignees: ["alice"] })).toEqual([]);
    expect(changedFields({ ...base, labels: ["a", "b"] }, { ...base, labels: ["b", "a"] })).toEqual([]);
  });

  it("falls back to safe defaults for unknown status/priority", () => {
    const row = toTrackedTask({ title: "t", status: "weird", priority: "urgent" });
    expect(row.status).toBe("open");
    expect(row.priority).toBe("medium");
  });
});

describe("decideTaskSync (AT-PM-SYNC)", () => {
  it("keeps a local edit when the external side did not change", () => {
    const decision = decideTaskSync({ base, stored: { ...base, title: "Actio で直した" }, external: base, localDirty: true, hasPendingConflict: false });
    expect(decision.kind).toBe("keep_local");
  });

  it("applies external changes when there is no local edit", () => {
    const decision = decideTaskSync({ base, stored: base, external: { ...base, title: "外部で直した" }, localDirty: false, hasPendingConflict: false });
    expect(decision).toEqual({ kind: "apply_external", externalChanges: ["title"] });
  });

  it("reports a conflict only when both sides changed", () => {
    const decision = decideTaskSync({ base, stored: { ...base, labels: ["ui", "x"] }, external: { ...base, title: "外" }, localDirty: true, hasPendingConflict: false });
    expect(decision.kind).toBe("conflict");
  });

  it("waits while a conflict is pending", () => {
    const decision = decideTaskSync({ base, stored: base, external: { ...base, title: "外" }, localDirty: true, hasPendingConflict: true });
    expect(decision.kind).toBe("await_resolution");
  });

  it("classifies close and reopen", () => {
    expect(externalChangeType(base, { ...base, status: "closed" })).toBe("closed");
    expect(externalChangeType({ ...base, status: "closed" }, base)).toBe("reopened");
    expect(externalChangeType(base, { ...base, title: "x" })).toBe("updated");
  });
});

describe("decideConflict (AT-PM-CONFLICT)", () => {
  it("Stage 1: merges non-overlapping fields from both sides", () => {
    const decision = decideConflict({ base, local: { ...base, labels: ["ui", "local"] }, external: { ...base, title: "外部" } });
    expect(decision.stage).toBe("auto_field_merge");
    if (decision.stage === "auto_field_merge") {
      expect(decision.merged.title).toBe("外部");
      expect(decision.merged.labels).toEqual(["ui", "local"]);
    }
  });

  it("Stage 2: hands overlapping fields to the LLM instead of silently taking external", () => {
    const decision = decideConflict({ base, local: { ...base, description: "Actio 側" }, external: { ...base, description: "外部側" } });
    expect(decision).toEqual({ stage: "claude_merge", overlappingFields: ["description"] });
  });

  it("Stage 3: open/closed disagreement takes the external version", () => {
    const decision = decideConflict({ base, local: { ...base, title: "x" }, external: { ...base, status: "closed" } });
    expect(decision.stage).toBe("force_external");
  });

  it("Stage 3: more than 70% external change takes the external version", () => {
    const external: TrackedTask = {
      title: "全部", description: "違う", status: "review", priority: "high", assignees: ["bob"], labels: ["x"],
      dueDate: "2026-11-01", milestoneExternalId: "3", milestoneName: base.milestoneName,
    };
    const decision = decideConflict({ base, local: { ...base, title: "y" }, external });
    expect(decision.stage).toBe("force_external");
  });

  it("applies an LLM resolution only to the overlapping fields", () => {
    const versions = { base, local: { ...base, description: "L", labels: ["l"] }, external: { ...base, description: "E", title: "外" } };
    const merged = applyOverlappingResolution(versions, ["description"], { description: "L+E", title: "勝手な変更" });
    expect(merged.description).toBe("L+E");
    expect(merged.title).toBe("外");
    expect(merged.labels).toEqual(["l"]);
  });
});

describe("merge prompt", () => {
  it("sends only the overlapping fields", () => {
    const request = JSON.parse(buildMergeRequest({ base, local: base, external: base }, ["description"]));
    expect(Object.keys(request.base)).toEqual(["description"]);
  });

  it("rejects fields that were not requested and invalid values", () => {
    expect(() => parseMergeResponse(JSON.stringify({ fields: { description: "x", title: "y" } }), ["description"])).toThrow();
    expect(() => parseMergeResponse(JSON.stringify({ fields: { status: "done" } }), ["status"])).toThrow();
    expect(parseMergeResponse(JSON.stringify({ fields: { status: "review" }, reason: "r" }), ["status"])).toEqual({ fields: { status: "review" }, reason: "r" });
  });
});

describe("github labels", () => {
  it("replaces status and priority labels and keeps the rest", () => {
    expect(githubLabelsFor(["ui", "wip", "P1"], "review", "low")).toEqual(["ui", "in-review", "low"]);
    expect(githubLabelsFor(["ui", "in-progress", "critical"], "open", "medium")).toEqual(["ui"]);
    expect(githubStateFor("closed")).toBe("closed");
    expect(githubStateFor("review")).toBe("open");
  });
});

describe("pm notifications (AT-PM-NOTIFY)", () => {
  const task = { id: "t1", projectId: "p1", title: "ログイン画面" };

  it("routes to Memoria with a project link and versioned dedupe keys", () => {
    const [closed] = externalChangeNotifications(task, base, { ...base, status: "closed" }, "closed", ["status"], "2026-10-02T00:00:00Z");
    expect(closed.event).toBe("pm.task.closed");
    expect(closed.teamId).toBeNull();
    expect(closed.link).toBe("/pm/p1");
    expect(closed.dedupeKey).toBe("pm.task.closed:t1:2026-10-02T00:00:00Z");
  });

  it("adds an assignment notification only for newly added assignees", () => {
    const intents = externalChangeNotifications(task, base, { ...base, assignees: ["alice", "bob"] }, "updated", ["assignees"], "v");
    expect(intents.map((i) => i.event)).toEqual(["pm.task.updated", "pm.task.assigned"]);
    expect(intents[1].body).toContain("bob");
  });

  it("limits deadline reminders and daily reports to once a day", () => {
    const a = deadlineNotification("warning", { ...task, dueDate: "2026-10-05" }, "2026-10-02");
    const b = deadlineNotification("warning", { ...task, dueDate: "2026-10-05" }, "2026-10-03");
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
    expect(reportReadyNotification({ id: "p1", name: "P" }, "2026-10-02", "s").dedupeKey).toBe("pm.report.ready:p1:2026-10-02");
  });
});

describe("isSyncDue", () => {
  const now = new Date("2026-10-02T10:00:00Z");

  it("runs when never synced and after the interval", () => {
    expect(isSyncDue({ syncIntervalMinutes: 15, lastSyncedAt: null, lastSyncResult: null }, now)).toBe(true);
    expect(isSyncDue({ syncIntervalMinutes: 15, lastSyncedAt: "2026-10-02T09:44:00Z", lastSyncResult: null }, now)).toBe(true);
    expect(isSyncDue({ syncIntervalMinutes: 15, lastSyncedAt: "2026-10-02T09:50:00Z", lastSyncResult: null }, now)).toBe(false);
  });

  it("backs off after a failed attempt instead of retrying every minute", () => {
    const failed = { attemptedAt: "2026-10-02T09:55:00Z", errors: ["GitHub API error: 500"] };
    expect(isSyncDue({ syncIntervalMinutes: 15, lastSyncedAt: "2026-10-02T08:00:00Z", lastSyncResult: failed }, now)).toBe(false);
  });
});
