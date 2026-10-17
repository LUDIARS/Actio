import { expect, it } from "vitest";
import { groupDdl, migrateGroupPostgres } from "../../src/db/group-postgres-migration.js";

it("creates groups before the tables that reference it, idempotently", async () => {
  const statements: string[] = [];
  await migrateGroupPostgres({ unsafe: async (sql: string) => { statements.push(sql); return []; } } as never);
  expect(statements).toEqual([...groupDdl]);
  const created = statements
    .map((sql) => /CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/.exec(sql)?.[1])
    .filter(Boolean);
  expect(created).toHaveLength(statements.length);
  expect(created.indexOf("groups")).toBeLessThan(created.indexOf("group_members"));
  expect(created.indexOf("groups")).toBeLessThan(created.indexOf("group_schedules"));
});

it("matches the columns the group repository reads", () => {
  const members = groupDdl.find((sql) => sql.includes("TABLE IF NOT EXISTS group_members"))!;
  for (const column of ["id", "group_id", "user_id", "role", "joined_at"]) expect(members).toMatch(new RegExp(`\\b${column}\\b`));
  const groups = groupDdl.find((sql) => sql.includes("TABLE IF NOT EXISTS groups"))!;
  for (const column of ["id", "name", "description", "created_by", "created_at"]) expect(groups).toMatch(new RegExp(`\\b${column}\\b`));
});

it("stops on the first failing statement so the caller can log it", async () => {
  const statements: string[] = [];
  const pool = { unsafe: async (sql: string) => {
    statements.push(sql);
    if (sql.includes("group_members")) throw new Error('relation "users" does not exist');
    return [];
  } };
  await expect(migrateGroupPostgres(pool as never)).rejects.toThrow('relation "users" does not exist');
  expect(statements).toHaveLength(2);
});
