import { afterEach, beforeEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { implementationDdl, implementationSqliteTriggers } from "../../src/db/implementation-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";
import { ImplementationStore } from "../../modules/task/implementation/store.js";
import type { ImplementationSubject } from "../../modules/task/implementation/contracts.js";

const now = new Date("2026-09-27T00:00:00Z");
const subject: ImplementationSubject = { kind: "scenario", id: "s", title: "朝の庭", revision: "v1", description: "穏やかな夜明け" };
let db: Database.Database, store: ImplementationStore;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, owner_id TEXT, assignee_id TEXT, project_id TEXT,
    team_id TEXT, lane TEXT, title TEXT, description TEXT, requirements TEXT, status TEXT, priority TEXT,
    deadline INTEGER, estimated_minutes INTEGER, creator_type TEXT, kind TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE team_members(team_id TEXT, user_id TEXT);
    INSERT INTO team_members VALUES ('team', 'human');
    INSERT INTO tasks(id,team_id,title,status,kind) VALUES ('task','team','実装','open','task'), ('foreign','other','他チーム','done','task');`);
  for (const ddl of [...implementationDdl, ...implementationSqliteTriggers]) db.exec(ddl);
  store = new ImplementationStore(sqliteGateDatabase(db));
});
afterEach(() => db.close());
const read = async (value = subject) => (await store.list("team", "p", [value]))[0];
const link = async () => store.change("team", "p", subject, "human", { action: "link", taskId: "task", note: "現行仕様の実装", fingerprint: (await read()).fingerprint }, now);
const confirm = async () => store.change("team", "p", subject, "human", { action: "confirm", note: "人間が動作を確認", fingerprint: (await read()).fingerprint }, now);

it("requires task completion then human confirmation; reopens invalidate even within one timestamp", async () => {
  expect((await read()).state).toBe("unregistered");
  expect((await link()).state).toBe("in_progress");
  await expect(confirm()).rejects.toThrow("タスク完了後");
  db.exec("UPDATE tasks SET status='done' WHERE id='task'");
  expect((await read()).state).toBe("awaiting_confirmation");
  expect((await confirm()).state).toBe("completed");
  db.exec("UPDATE tasks SET status='open' WHERE id='task'; UPDATE tasks SET status='done' WHERE id='task'");
  expect((await read()).state).toBe("awaiting_confirmation");
  expect((await read()).confirmation).toBeNull();
  expect((await confirm()).state).toBe("completed");
  expect(db.prepare("SELECT COUNT(*) AS n FROM pf_implementation_reviews").get()).toEqual({ n: 2 });
});
it("returns completed work by adding a real Actio backlog and requires another confirmation", async () => {
  await link(); db.exec("UPDATE tasks SET status='done' WHERE id='task'"); await confirm();
  const before = await read();
  const returned = await store.change("team", "p", subject, "human", { action: "backlog", fingerprint: before.fingerprint,
    title: "光の調整", note: "確認で見つかった差分", assigneeId: "human", deadline: now.toISOString(), estimatedMinutes: 30 }, now);
  expect(returned.state).toBe("returned"); expect(returned.tasks).toHaveLength(2);
  expect(returned.confirmation).toBeNull();
  const task = returned.tasks.find(item => item.id !== "task")!;
  expect(db.prepare("SELECT lane, status FROM tasks WHERE id=?").get(task.id)).toEqual({ lane: "backlog", status: "open" });
  db.prepare("UPDATE tasks SET status='done' WHERE id=?").run(task.id);
  expect((await read()).state).toBe("awaiting_confirmation");
});
it("invalidates on specification changes and rejects stale or cross-team actions atomically", async () => {
  await link(); db.exec("UPDATE tasks SET status='done' WHERE id='task'"); await confirm();
  const stale = await read(), revised = { ...subject, revision: "v2" };
  expect((await read(revised)).state).toBe("specification_changed");
  await expect(store.change("team", "p", revised, "human", { action: "confirm", note: "old", fingerprint: stale.fingerprint }, now)).rejects.toThrow("変更");
  await expect(store.change("team", "p", subject, "human", { action: "link", taskId: "foreign", note: "invalid", fingerprint: stale.fingerprint }, now)).rejects.toThrow("同じチーム");
  await expect(store.change("team", "p", subject, "human", { action: "backlog", title: "invalid", assigneeId: "foreign", note: "invalid",
    deadline: now.toISOString(), estimatedMinutes: 10, fingerprint: stale.fingerprint }, now)).rejects.toThrow("担当者");
  expect((await read()).tasks).toHaveLength(1);
  expect(await store.list("other", "p", [subject])).toMatchObject([{ state: "unregistered" }]);
});
it("never treats missing or cancelled tasks as complete; migration preserves accepted work", async () => {
  await link(); db.exec("UPDATE tasks SET status='done' WHERE id='task'"); await confirm();
  for (const ddl of [...implementationDdl, ...implementationSqliteTriggers]) db.exec(ddl);
  expect((await read()).state).toBe("completed");
  db.exec("UPDATE tasks SET status='cancelled' WHERE id='task'"); expect((await read()).state).toBe("in_progress");
  db.exec("DELETE FROM tasks WHERE id='task'");
  expect((await read()).tasks[0].status).toBe("missing"); expect((await read()).state).toBe("in_progress");
});
