import { describe, expect, it } from "vitest";
import { validateLaneTransition, validateTeamTask } from "../../modules/task/validation/team-task.js";

const deps = { isMember: () => true, isTaskInTeam: () => true };
describe("team task validation", () => {
  it("derives backlog from duration in minimal mode", async () => {
    const result = await validateTeamTask({ teamId: "team", assigneeId: "user", durationDays: 2 }, "minimal", deps);
    expect(result.error).toBeUndefined();
    expect(result.value.lane).toBe("backlog");
  });
  it("requires a deadline for full backlog input", async () => {
    const result = await validateTeamTask({ teamId: "team", assigneeId: "user", lane: "backlog" }, "full", deps);
    expect(result.error).toContain("deadline");
  });
  it("drops the deadline when moving back to daily", () => {
    expect(validateLaneTransition({ teamId: "team", lane: "backlog", sprintId: null }, { lane: "daily" }).deadline).toBeNull();
  });
  it("rejects invalid duration and blocked_by shapes", async () => {
    const duration = await validateTeamTask({ teamId: "team", assigneeId: "user", durationDays: 0 }, "minimal", deps);
    expect(duration.error).toContain("positive integer");
    const blockedBy = await validateTeamTask({ teamId: "team", assigneeId: "user", blockedBy: [""] }, "minimal", deps);
    expect(blockedBy.error).toContain("array of task ids");
    const nullBlockedBy = await validateTeamTask({ teamId: "team", assigneeId: "user", blockedBy: null }, "minimal", deps);
    expect(nullBlockedBy.error).toContain("array of task ids");
  });
});
