import { expect, it } from "vitest";
import type postgres from "postgres";
import { PlanningPostgres } from "../../src/db/planning-postgres.js";

function fixture() {
  const statements: { sql: string; args: unknown[]; transaction: boolean }[] = [];
  const query = (transaction: boolean) => async (sql: string, args: unknown[] = []) => {
    statements.push({ sql, args, transaction });
    return [{ id: "task", deadline: new Date("2026-09-13T00:00:00Z") }];
  };
  const transaction = { unsafe: query(true) };
  const pool = { unsafe: query(false), begin: async (work: (sql: unknown) => Promise<void>) => {
    try { await work(transaction); statements.push({ sql: "COMMIT", args: [], transaction: true }); }
    catch (error) { statements.push({ sql: "ROLLBACK", args: [], transaction: true }); throw error; }
  } };
  return { store: new PlanningPostgres(pool as unknown as postgres.Sql), statements };
}
it("uses one transaction connection for advisory locks and task row locks", async () => {
  const { store, statements } = fixture();
  await store.transaction(async () => {
    await store.prepare("SELECT id AS taskId FROM tasks WHERE id = ?").get("task");
    await store.prepare("UPDATE tasks SET title = ? WHERE id = ?").run("日本語", "task");
  }, "team");
  expect(statements.every(s => s.transaction)).toBe(true);
  expect(statements[0].args).toEqual(["actio-planning:team"]);
  expect(statements[1].sql).toBe('SELECT id AS "taskId" FROM tasks WHERE id = $1 FOR UPDATE');
  expect(statements.at(-1)?.sql).toBe("COMMIT");
});
it("propagates failures for rollback and does not retain the transaction connection", async () => {
  const { store, statements } = fixture();
  await expect(store.transaction(async () => { throw new Error("conflict"); }, "team")).rejects.toThrow("conflict");
  expect(statements.at(-1)?.sql).toBe("ROLLBACK");
  const row = await store.prepare("SELECT deadline FROM tasks WHERE id = ?").get("task");
  expect(row).toEqual({ id: "task", deadline: 1789257600 });
  expect(statements.at(-1)?.transaction).toBe(false);
  expect(statements.at(-1)?.sql).not.toContain("FOR UPDATE");
});
