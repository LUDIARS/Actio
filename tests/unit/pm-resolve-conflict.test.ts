import { describe, expect, it } from "vitest";
import type { PmConflictRow, PmConflictStore, PmProjectRow, PmTaskRow } from "../../modules/pm/application/ports.js";
import { runProjectReminders } from "../../modules/pm/application/reminder-cycle.js";
import { autoMergeConflict, ConflictResolutionError, resolveConflictManually, type ResolveDeps } from "../../modules/pm/application/resolve-conflict.js";
import type { PmNotificationIntent } from "../../modules/pm/domain/notifications.js";
import type { TrackedTask } from "../../modules/pm/domain/tracked-task.js";
import type { MergeModel } from "../../modules/pm/llm/merge-client.js";

const base: TrackedTask = {
  title: "ログイン画面", description: "本文", status: "open", priority: "medium",
  assignees: [], labels: ["ui"], dueDate: null, milestoneExternalId: null, milestoneName: null,
};

function conflictRow(): PmConflictRow {
  return {
    id: "c1",
    taskId: "t1",
    projectId: "p1",
    baseVersion: base,
    localVersion: { ...base, description: "Actio 側", labels: ["ui", "local"] },
    externalVersion: { ...base, description: "外部側", title: "外部タイトル" },
    resolution: "claude_merge",
    resolvedData: null,
    status: "pending",
    createdAt: "2026-10-02T00:00:00Z",
    resolvedAt: null,
  };
}

function setup() {
  let conflict = conflictRow();
  const taskUpdates: Record<string, unknown>[] = [];
  const intents: PmNotificationIntent[] = [];
  let needsHuman = 0;
  const store: PmConflictStore = {
    findConflict: async () => conflict,
    findTask: async () => ({ id: "t1", title: "ログイン画面" }) as PmTaskRow,
    markResolvedIfPending: async (_id, data) => {
      if (conflict.status !== "pending") return false;
      conflict = { ...conflict, ...data } as PmConflictRow;
      return true;
    },
    markNeedsHuman: async () => { needsHuman++; conflict = { ...conflict, resolution: "manual" }; },
    updateTask: async (_id, data) => { taskUpdates.push(data); },
    createSnapshot: async () => {},
    invalidateAnalytics: async () => {},
  };
  const deps: ResolveDeps = {
    store,
    enqueue: async (list) => { intents.push(...list); },
    now: () => new Date("2026-10-02T01:00:00Z"),
    newId: () => "s1",
    hashDescription: (d) => d ?? "",
  };
  return { deps, taskUpdates, intents, get conflict() { return conflict; }, get needsHuman() { return needsHuman; } };
}

describe("resolveConflictManually (AT-PM-CONFLICT)", () => {
  it("applies the external version without a writeback", async () => {
    const ctx = setup();
    const outcome = await resolveConflictManually("c1", { kind: "force_external" }, ctx.deps);
    expect(outcome.dirty).toBe(false);
    expect(ctx.taskUpdates[0]).toMatchObject({ description: "外部側", title: "外部タイトル", dirtyFlag: 0 });
  });

  it("keeps the local version and marks it for writeback", async () => {
    const ctx = setup();
    const outcome = await resolveConflictManually("c1", { kind: "keep_local" }, ctx.deps);
    expect(outcome.dirty).toBe(true);
    expect(ctx.taskUpdates[0]).toMatchObject({ description: "Actio 側", dirtyFlag: 1 });
  });

  it("rejects resolving the same conflict twice", async () => {
    const ctx = setup();
    await resolveConflictManually("c1", { kind: "force_external" }, ctx.deps);
    await expect(resolveConflictManually("c1", { kind: "keep_local" }, ctx.deps)).rejects.toMatchObject({ status: 409 });
    expect(ctx.taskUpdates).toHaveLength(1);
  });

  it("validates manual data", async () => {
    const ctx = setup();
    await expect(resolveConflictManually("c1", { kind: "manual", data: { status: "done" } }, ctx.deps)).rejects.toBeInstanceOf(ConflictResolutionError);
    const outcome = await resolveConflictManually("c1", { kind: "manual", data: { description: "両方" } }, ctx.deps);
    expect(outcome.resolvedData.description).toBe("両方");
    expect(outcome.resolvedData.title).toBe("外部タイトル");
  });
});

describe("autoMergeConflict (Stage 2)", () => {
  it("merges only the overlapping field from the model output", async () => {
    const ctx = setup();
    const model: MergeModel = { complete: async () => JSON.stringify({ fields: { description: "Actio 側 + 外部側" }, reason: "両方残した" }) };
    const outcome = await autoMergeConflict("c1", model, ctx.deps, new AbortController().signal);
    expect(outcome.resolution).toBe("claude_merge");
    expect(outcome.resolvedData).toMatchObject({ description: "Actio 側 + 外部側", title: "外部タイトル", labels: ["ui", "local"] });
    expect(outcome.dirty).toBe(true);
    expect(ctx.intents.map((i) => i.event)).toEqual(["pm.sync.claude_merged"]);
  });

  it("returns the conflict to a human when the model output is invalid", async () => {
    const ctx = setup();
    const model: MergeModel = { complete: async () => JSON.stringify({ fields: { title: "勝手に変更" } }) };
    await expect(autoMergeConflict("c1", model, ctx.deps, new AbortController().signal)).rejects.toMatchObject({ status: 503 });
    expect(ctx.needsHuman).toBe(1);
    expect(ctx.conflict.status).toBe("pending");
    expect(ctx.taskUpdates).toHaveLength(0);
  });
});

describe("runProjectReminders (AT-PM-REMINDER)", () => {
  const project = { id: "p1", name: "Actio", reminderSettings: { dailyCheckTime: "09:00" } } as unknown as PmProjectRow;
  const tasks = [
    { id: "t1", title: "a", dueDate: "2026-10-03", status: "open", assignees: [] },
    { id: "t2", title: "b", dueDate: "2026-09-30", status: "open", assignees: [] },
  ] as unknown as PmTaskRow[];

  it("sends nothing before the check time", async () => {
    const intents: PmNotificationIntent[] = [];
    const count = await runProjectReminders(project, { listTasks: async () => tasks, enqueue: async (l) => { intents.push(...l); }, now: () => new Date(2026, 9, 2, 8, 0) });
    expect(count).toBe(0);
  });

  it("sends warning, overdue and the daily report after the check time", async () => {
    const intents: PmNotificationIntent[] = [];
    await runProjectReminders(project, { listTasks: async () => tasks, enqueue: async (l) => { intents.push(...l); }, now: () => new Date(2026, 9, 2, 9, 30) });
    expect(intents.map((i) => i.event)).toEqual(["pm.deadline.warning", "pm.deadline.overdue", "pm.report.ready"]);
  });
});
