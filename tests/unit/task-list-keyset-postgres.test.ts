import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";
import { taskListAfterCondition } from "../../src/db/task-list-keyset.js";

vi.mock("../../src/db/connection.js", async () => {
  const { pgTable, text, timestamp } = await import("drizzle-orm/pg-core");
  return {
    dialect: "postgres",
    schema: {
      tasks: pgTable("tasks", {
        id: text("id"),
        status: text("status"),
        deadline: timestamp("deadline"),
        updatedAt: timestamp("updated_at"),
      }),
    },
  };
});

it("uses one PostgreSQL row bound with the timestamp and id in index order", () => {
  const updatedAt = new Date("2026-11-25T05:00:00.123Z");
  const filter = taskListAfterCondition({ sort: "default", updatedAt: updatedAt.getTime(), id: "task-a" });
  const query = new PgDialect().sqlToQuery(filter);
  expect(query.sql).toBe('("tasks"."updated_at", "tasks"."id") < ($1, $2)');
  expect(query.params).toEqual([updatedAt.toISOString(), "task-a"]);
});
