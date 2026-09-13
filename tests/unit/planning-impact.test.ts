import { describe, expect, it } from "vitest";
import { sprintImpact } from "../../modules/task/planning/impact.js";
import type { BacklogTask, Sprint } from "../../modules/task/planning/contracts.js";

const sprint: Sprint = { id: "s", teamId: "team", name: "Sprint", goal: null, status: "planning", revision: 0,
  startsOn: "2026-09-14", endsOn: "2026-09-20", originalEndsOn: "2026-09-20", bufferEndsOn: "2026-09-22",
  cadenceDays: 7, capacityMinutes: 700 };
const task = (minutes: number | null): BacklogTask => ({ id: "task", title: "Task", description: null,
  requirements: null, status: "open", priority: "medium", assigneeId: "member", projectId: "p", deadline: null,
  estimatedMinutes: minutes, sprintId: "s", category: null, groupId: null, position: 0, fingerprint: "snapshot" });

describe("buffer impact", () => {
  it("distinguishes initial deadline, buffer and rescheduling thresholds", () => {
    expect(sprintImpact(sprint, [task(700)]).state).toBe("within");
    expect(sprintImpact(sprint, [task(900)]).state).toBe("buffer");
    expect(sprintImpact(sprint, [task(901)]).state).toBe("reschedule");
  });
  it("does not promise a date with missing estimates/capacity", () => {
    expect(sprintImpact(sprint, [task(null)]).state).toBe("unknown");
    expect(sprintImpact({ ...sprint, capacityMinutes: null }, [task(100)]).projectedEndsOn).toBeNull();
  });
  it("counts only pending work assigned to this sprint", () => {
    expect(sprintImpact(sprint, [task(200), { ...task(500), id: "done", status: "done" },
      { ...task(1000), id: "backlog", sprintId: null }]).estimatedMinutes).toBe(200);
  });
});
