import { describe, expect, it } from "vitest";
import { sprintImpact } from "../../modules/task/planning/impact.js";
import { PostgresBacklogStore } from "../../modules/task/planning/postgres-backlog-store.js";
import type { Sprint } from "../../modules/task/planning/contracts.js";
import type { PlanningPostgres } from "../../src/db/planning-postgres.js";

describe("PostgreSQL backlog timestamps", () => {
  it("returns epoch seconds for string timestamps so sprint impact can be computed", async () => {
    const row = { id: "task", status: "open", sprintId: "sprint", estimatedMinutes: 60,
      deadline: "2026-12-11 09:00:00", updatedAt: "2026-11-26 13:00:00.123" };
    const database = { prepare: () => ({ all: async () => [row] }) } as unknown as PlanningPostgres;
    const [task] = await new PostgresBacklogStore(database).list("team");
    expect(task.deadline).toBe(Date.parse("2026-12-11T09:00:00Z") / 1000);
    expect(task.updatedAt).toBe(Math.floor(Date.parse("2026-11-26T13:00:00.123Z") / 1000));
    const sprint = { id: "sprint", startsOn: "2026-11-30", endsOn: "2026-12-11", bufferEndsOn: "2026-12-14",
      cadenceDays: 14, capacityMinutes: null } as Sprint;
    expect(sprintImpact(sprint, [task]).overdueTaskIds).toEqual([]);
  });
});
