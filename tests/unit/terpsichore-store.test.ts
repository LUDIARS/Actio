import { afterEach, beforeEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migratePlanning } from "../../src/db/planning-migration.js";
import { GuidancePlanStore } from "../../modules/task/terpsichore/plan-store.js";
import { ExecutionStore } from "../../modules/task/terpsichore/execution-store.js";
import { assessGuidance } from "../../modules/task/terpsichore/guidance.js";
import { buildExecutionManifest } from "@ludiars/terpsichore";
import { input, now, task } from "../fixtures/terpsichore.js";

let db: Database.Database;
beforeEach(() => { db = new Database(":memory:"); db.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY)"); migratePlanning(db); });
afterEach(() => db.close());
it("preserves independent team/sprint scopes and rejects stale plan saves", async () => {
  const store = new GuidancePlanStore(db), plan = input();
  await store.save("team", "leader", plan, 0, now);
  await expect(store.save("team", "leader", plan, 0, now)).rejects.toThrow("他で更新");
  expect((await store.save("team", "leader", plan, 1, now)).revision).toBe(2);
  await expect(store.save("team", "leader", plan, 1, now)).rejects.toThrow("他で更新");
  expect(await store.load("other-team", "At", null)).toBeNull();
  expect(await store.load("team", "At", "other-sprint")).toBeNull();
  migratePlanning(db);
  expect((await store.load("team", "At", null))?.revision).toBe(2);
});
it("keeps lost sends reserved, preserves immutable scope and cannot resurrect a terminal execution", async () => {
  const store = new ExecutionStore(db), plan = input(), tasks = [task("a")];
  const manifest = buildExecutionManifest(plan, 1, tasks, assessGuidance(plan, tasks, [], now));
  const record = await store.reserve("team", "leader", manifest, now);
  await store.observe(record.id, null, "unknown");
  await expect(store.reserve("team", "leader", manifest, now)).rejects.toThrow("確認待ち");
  expect(await store.manifest("team", record.id)).toEqual(manifest);
  await expect(store.manifest("other-team", record.id)).rejects.toThrow("見つかりません");
  await store.observe(record.id, "cc-run", "running");
  await store.observe(record.id, "cc-run", "completed");
  await store.observe(record.id, null, "unknown");
  expect((await store.latest("team", "At"))?.state).toBe("completed");
  const next = await store.reserve("team", "leader", manifest, new Date(now.getTime() + 1));
  expect(next.id).not.toBe(record.id);
});
