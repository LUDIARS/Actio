import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migratePlanning } from "../../src/db/planning-migration.js";
import { SprintStore } from "../../modules/task/planning/sprint-store.js";
import { BacklogStore } from "../../modules/task/planning/backlog-store.js";
import { SpecImportStore } from "../../modules/task/planning/spec-import-store.js";
import { newSprint } from "../../modules/task/planning/contracts.js";

const now = new Date("2026-09-13T00:00:00Z");
const plan = { name: "Sprint 1", goal: "改善", startsOn: "2026-09-14", endsOn: "2026-09-20",
  bufferEndsOn: "2026-09-22", cadenceDays: 7, capacityMinutes: 600 };
let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE team_refs(id TEXT PRIMARY KEY);
    CREATE TABLE team_members(team_id TEXT, user_id TEXT);
    INSERT INTO team_refs VALUES ('team'); INSERT INTO team_members VALUES ('team', 'member');
    CREATE TABLE tasks(id TEXT PRIMARY KEY, owner_id TEXT, team_id TEXT, assignee_id TEXT, lane TEXT,
      sprint_id TEXT, title TEXT, description TEXT, requirements TEXT, status TEXT, priority TEXT,
      project_id TEXT, deadline INTEGER, estimated_minutes INTEGER, category TEXT, updated_at INTEGER,
      created_at INTEGER, carried_from_sprint_id TEXT, source TEXT, source_ref TEXT, creator_type TEXT,
      kind TEXT, plugin_payload TEXT, UNIQUE(source, source_ref));
    INSERT INTO tasks(id,team_id,assignee_id,lane,title,status,project_id,updated_at)
      VALUES ('a','team','member','backlog','Task A','open','project',1),
      ('b','team','member','backlog','Task B','open','project',1);`);
  migratePlanning(db);
});
afterEach(() => db.close());

describe("sprint changes", () => {
  it("requires initial dates/cadence/buffer and rejects impossible dates", () => {
    expect(newSprint.safeParse({ ...plan, cadenceDays: undefined }).success).toBe(false);
    expect(newSprint.safeParse({ ...plan, bufferEndsOn: "2026-09-19" }).success).toBe(false);
    expect(newSprint.safeParse({ ...plan, startsOn: "2026-02-30" }).success).toBe(false);
  });
  it("preserves the initial deadline and requires rescheduling beyond buffer", () => {
    const store = new SprintStore(db), sprint = store.create("team", "leader", plan, now);
    expect(() => store.change("team", sprint.id, "leader", { action: "extend", revision: 0, endsOn: "2026-09-23", reason: "仕様追加" }, now)).toThrow("バッファ");
    expect(store.find("team", sprint.id).revision).toBe(0);
    const extended = store.change("team", sprint.id, "leader", { action: "extend", revision: 0, endsOn: "2026-09-22", reason: "仕様追加" }, now);
    expect(extended.originalEndsOn).toBe("2026-09-20");
    expect(() => store.change("team", sprint.id, "leader", { action: "start", revision: 0, reason: "開始" }, now)).toThrow("変更");
    expect(store.history("team", sprint.id)).toHaveLength(2);
  });
  it("allows active insertion and atomically carries unfinished tasks back on closure", () => {
    const store = new SprintStore(db), sprint = store.create("team", "leader", plan, now);
    store.change("team", sprint.id, "leader", { action: "start", revision: 0, reason: "開始" }, now);
    store.change("team", sprint.id, "leader", { action: "assign", revision: 1, taskId: "a", reason: "差し込み" }, now);
    store.change("team", sprint.id, "leader", { action: "close", revision: 2, reason: "終了" }, now);
    expect(db.prepare("SELECT sprint_id, carried_from_sprint_id FROM tasks WHERE id='a'").get())
      .toEqual({ sprint_id: null, carried_from_sprint_id: sprint.id });
    expect(() => store.change("team", sprint.id, "leader", { action: "assign", revision: 3, taskId: "b", reason: "追加" }, now)).toThrow("終了");
  });
  it("rejects foreign team tasks and reports a conflicting successor sprint", () => {
    const store = new SprintStore(db), sprint = store.create("team", "leader", plan, now);
    db.prepare("UPDATE tasks SET team_id='foreign' WHERE id='b'").run();
    expect(() => store.change("team", sprint.id, "leader", { action: "assign", revision: 0, taskId: "b", reason: "追加" }, now)).toThrow("同じチーム");
    store.create("team", "leader", { ...plan, name: "Sprint 2", startsOn: "2026-09-23", endsOn: "2026-09-29", bufferEndsOn: "2026-09-30" }, now);
    expect(() => store.change("team", sprint.id, "leader", { ...plan, action: "reschedule", revision: 0, endsOn: "2026-09-24", bufferEndsOn: "2026-09-25", reason: "仕様追加" }, now)).toThrow("Sprint 2");
  });
});

describe("Memoria grouping guard", () => {
  it("rejects changed descriptions without creating a partial group", () => {
    const store = new BacklogStore(db), snapshots = store.list("team").map(t => ({ id: t.id, fingerprint: t.fingerprint }));
    db.prepare("UPDATE tasks SET description='edited' WHERE id='a'").run();
    expect(() => store.group("team", "leader", { name: "group", reason: "共通", tasks: snapshots }, now)).toThrow("変更");
    expect(store.groups("team")).toHaveLength(0);
  });
  it("groups without completing/deleting tasks and can ungroup", () => {
    const store = new BacklogStore(db), tasks = store.list("team").map(t => ({ id: t.id, fingerprint: t.fingerprint }));
    const id = store.group("team", "leader", { name: "group", reason: "共通", tasks }, now);
    expect(store.list("team").map(t => t.status)).toEqual(["open", "open"]);
    store.ungroup("team", id);
    expect(store.list("team").map(t => t.groupId)).toEqual([null, null]);
    migratePlanning(db); // startup migration is repeatable and preserves existing task contents.
    expect(store.list("team")).toHaveLength(2);
  });
});

it("imports reviewed Pf content idempotently and rejects an outdated fingerprint", () => {
  const store = new SpecImportStore(db);
  const detail = { spec: { id: "spec", projectId: "project", code: "PF-1", title: "仕様", description: "内容", status: "approved", version: 2, priority: "must" },
    targets: [], acceptance: [{ text: "受入条件", enabled: true }], fingerprint: "current" };
  const input = { fingerprint: "current", assigneeId: "member", deadline: "2026-09-20T00:00:00Z", estimatedMinutes: 60, reviewNote: "差分を確認" };
  expect(() => store.import("team", "leader", detail, { ...input, fingerprint: "stale" }, now)).toThrow("再精査");
  const first = store.import("team", "leader", detail, input, now);
  expect(first.created).toBe(true);
  expect(store.import("team", "leader", detail, input, now)).toEqual({ id: first.id, created: false });
  expect(db.prepare("SELECT requirements FROM tasks WHERE id=?").get(first.id)).toEqual({ requirements: expect.stringContaining("受入条件") });
  const snapshot = store.existing("team", "project", "spec")!;
  const sprintStore = new SprintStore(db);
  const sprint = sprintStore.create("team", "leader", plan, now);
  sprintStore.change("team", sprint.id, "leader", { action: "assign", revision: 0, taskId: first.id, reason: "割付" }, now);
  expect(() => store.import("team", "leader", detail, { ...input, existingFingerprint: snapshot.fingerprint }, now)).toThrow("変更");
  const assigned = store.existing("team", "project", "spec")!;
  store.import("team", "leader", detail, { ...input, estimatedMinutes: 900, existingFingerprint: assigned.fingerprint }, now);
  expect(sprintStore.find("team", sprint.id).revision).toBe(2);
  expect((db.prepare("SELECT COUNT(*) AS n FROM task_spec_reviews").get() as { n: number }).n).toBe(2);
});
