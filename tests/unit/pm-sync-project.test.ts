import { describe, expect, it } from "vitest";
import type { PmConflictRow, PmProjectRow, PmSyncStore, PmTaskRow } from "../../modules/pm/application/ports.js";
import { SyncInProgressError, SyncLock, syncProject, type SyncDeps } from "../../modules/pm/application/sync-project.js";
import type { PmNotificationIntent } from "../../modules/pm/domain/notifications.js";
import { toTrackedTask, type TrackedTask } from "../../modules/pm/domain/tracked-task.js";
import type { ExternalTask } from "../../modules/pm/types.js";

const project = {
  id: "p1",
  name: "Actio",
  source: "github",
  sourceConfig: { owner: "o", repo: "r", token: "t" },
  syncIntervalMinutes: 15,
  lastSyncedAt: null,
  lastSyncResult: null,
  reminderSettings: null,
  ownerId: "u1",
  createdAt: new Date(),
  updatedAt: new Date(),
} as PmProjectRow;

function external(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    externalId: "12",
    externalUrl: "https://github.com/o/r/issues/12",
    title: "ログイン画面",
    description: "本文",
    status: "open",
    priority: "medium",
    assignees: ["alice"],
    labels: ["ui"],
    dueDate: null,
    milestoneExternalId: null,
    milestoneName: null,
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

class MemoryStore implements PmSyncStore {
  tasks = new Map<string, PmTaskRow>();
  snapshots: { taskId: string; changeType: string; snapshotData: Record<string, unknown>; detectedAt: string; seq: number }[] = [];
  conflicts: PmConflictRow[] = [];
  projectUpdates: Record<string, unknown>[] = [];
  invalidated = 0;
  private seq = 0;

  async listTasks() { return [...this.tasks.values()]; }
  async listDirty() { return [...this.tasks.values()].filter((t) => t.dirtyFlag === 1); }
  async createTask(task: Record<string, unknown>) {
    this.tasks.set(task.id as string, { dirtyFlag: 0, estimatedHours: null, blockedBy: [], localUpdatedAt: null, createdAt: new Date(), updatedAt: new Date(), ...task } as unknown as PmTaskRow);
  }
  async updateTask(id: string, data: Record<string, unknown>) {
    const row = this.tasks.get(id);
    if (row) this.tasks.set(id, { ...row, ...data } as PmTaskRow);
  }
  async latestSnapshots(taskIds: string[]) {
    const latest = new Map<string, Record<string, unknown>>();
    for (const s of [...this.snapshots].sort((a, b) => a.seq - b.seq)) if (taskIds.includes(s.taskId)) latest.set(s.taskId, s.snapshotData);
    return latest;
  }
  async createSnapshot(s: { taskId: string; changeType: string; snapshotData?: Record<string, unknown>; detectedAt: string }) {
    this.snapshots.push({ taskId: s.taskId, changeType: s.changeType, snapshotData: s.snapshotData ?? {}, detectedAt: s.detectedAt, seq: this.seq++ });
  }
  async pendingConflicts() { return this.conflicts.filter((c) => c.status === "pending"); }
  async createConflict(c: Record<string, unknown>) { this.conflicts.push(c as unknown as PmConflictRow); }
  async updateConflict(id: string, data: Record<string, unknown>) {
    this.conflicts = this.conflicts.map((c) => (c.id === id ? ({ ...c, ...data } as PmConflictRow) : c));
  }
  async updateProject(_id: string, data: Record<string, unknown>) { this.projectUpdates.push(data); }
  async invalidateAnalytics() { this.invalidated++; }
}

function setup(externalTasks: () => ExternalTask[] | Promise<ExternalTask[]>) {
  const store = new MemoryStore();
  const intents: PmNotificationIntent[] = [];
  const written: TrackedTask[] = [];
  const reviews: string[] = [];
  let id = 0;
  const deps: SyncDeps = {
    store,
    fetchExternal: async () => externalTasks(),
    writeback: async (_project, task) => {
      const sent = toTrackedTask(task as unknown as Record<string, unknown>);
      written.push(sent);
      return sent;
    },
    enqueue: async (list) => { intents.push(...list); },
    onReviewTransition: (_p, ids) => { reviews.push(...ids); },
    now: () => new Date("2026-10-02T00:00:00Z"),
    newId: () => `id-${++id}`,
    hashDescription: (d) => d ?? "",
  };
  return { store, deps, intents, written, reviews };
}

describe("syncProject (AT-PM-SYNC)", () => {
  it("creates new tasks with a base snapshot and a notification", async () => {
    const { store, deps, intents } = setup(() => [external()]);
    const result = await syncProject(project, deps, new SyncLock());
    expect(result.created).toBe(1);
    expect(store.snapshots[0].changeType).toBe("created");
    expect(intents.map((i) => i.event)).toEqual(["pm.task.created"]);
    expect(store.projectUpdates[0].lastSyncedAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("does not overwrite an unsent local edit when the external side is unchanged, and writes it back", async () => {
    let ext = [external()];
    const { store, deps, written } = setup(() => ext);
    await syncProject(project, deps, new SyncLock());
    const [taskId] = store.tasks.keys();
    await store.updateTask(taskId, { title: "Actio で直した", dirtyFlag: 1 });

    ext = [external({ updatedAt: "2026-10-01T00:00:00Z" })];
    const result = await syncProject(project, deps, new SyncLock());

    expect(result.unchanged).toBe(1);
    expect(written.map((w) => w.title)).toEqual(["Actio で直した"]);
    expect(store.tasks.get(taskId)?.title).toBe("Actio で直した");
    expect(store.tasks.get(taskId)?.dirtyFlag).toBe(0);
    // 書き戻した値が次回の base になり、自分の変更を外部変更として取り込まない
    ext = [external({ title: "Actio で直した", updatedAt: "2026-10-02T00:00:00Z" })];
    const third = await syncProject(project, deps, new SyncLock());
    expect(third.updated).toBe(0);
    expect(third.unchanged).toBe(1);
  });

  it("applies external changes and reports review transitions", async () => {
    let ext = [external()];
    const { store, deps, intents, reviews } = setup(() => ext);
    await syncProject(project, deps, new SyncLock());
    ext = [external({ status: "review", labels: ["ui", "in-review"], updatedAt: "2026-10-02T00:00:00Z" })];
    const result = await syncProject(project, deps, new SyncLock());
    expect(result.updated).toBe(1);
    const [taskId] = store.tasks.keys();
    expect(store.tasks.get(taskId)?.status).toBe("review");
    expect(reviews).toEqual([taskId]);
    expect(intents.at(-1)?.event).toBe("pm.task.updated");
  });

  it("keeps an overlapping conflict pending once and does not write it back", async () => {
    let ext = [external()];
    const { store, deps, written } = setup(() => ext);
    await syncProject(project, deps, new SyncLock());
    const [taskId] = store.tasks.keys();
    await store.updateTask(taskId, { description: "Actio 側", dirtyFlag: 1 });

    ext = [external({ description: "外部側", updatedAt: "2026-10-02T00:00:00Z" })];
    await syncProject(project, deps, new SyncLock());
    ext = [external({ description: "外部側 2", updatedAt: "2026-10-03T00:00:00Z" })];
    const result = await syncProject(project, deps, new SyncLock());

    expect(store.conflicts).toHaveLength(1);
    expect(store.conflicts[0].resolution).toBe("claude_merge");
    expect(toTrackedTask(store.conflicts[0].externalVersion).description).toBe("外部側 2");
    expect(store.tasks.get(taskId)?.description).toBe("Actio 側");
    expect(written).toHaveLength(0);
    expect(result.conflicts).toBe(1);
  });

  it("merges non-overlapping changes and writes the local part back", async () => {
    let ext = [external()];
    const { store, deps, written, intents } = setup(() => ext);
    await syncProject(project, deps, new SyncLock());
    const [taskId] = store.tasks.keys();
    await store.updateTask(taskId, { labels: ["ui", "local"], dirtyFlag: 1 });

    ext = [external({ title: "外部で直した", updatedAt: "2026-10-02T00:00:00Z" })];
    await syncProject(project, deps, new SyncLock());

    expect(store.tasks.get(taskId)?.title).toBe("外部で直した");
    expect(store.tasks.get(taskId)?.labels).toEqual(["ui", "local"]);
    expect(written[0]?.labels).toEqual(["ui", "local"]);
    expect(intents.some((i) => i.event === "pm.sync.auto_merged")).toBe(true);
  });

  it("keeps lastSyncedAt and records the error when the external fetch fails", async () => {
    const { store, deps } = setup(() => { throw new Error("GitHub API error: 401 Unauthorized"); });
    const result = await syncProject(project, deps, new SyncLock());
    expect(result.errors).toEqual(["GitHub API error: 401 Unauthorized"]);
    expect(store.projectUpdates[0]).not.toHaveProperty("lastSyncedAt");
    expect(store.projectUpdates[0].lastSyncResult).toMatchObject({ attemptedAt: "2026-10-02T00:00:00.000Z" });
    expect(store.invalidated).toBe(0);
  });

  it("rejects a second sync of the same project while one is running", async () => {
    let release: (tasks: ExternalTask[]) => void = () => {};
    const { deps } = setup(() => new Promise<ExternalTask[]>((resolve) => { release = resolve; }));
    const lock = new SyncLock();
    const first = syncProject(project, deps, lock);
    await expect(syncProject(project, deps, lock)).rejects.toBeInstanceOf(SyncInProgressError);
    release([]);
    await first;
    expect(lock.isRunning(project.id)).toBe(false);
  });
});
