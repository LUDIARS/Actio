import { describe, expect, it } from "vitest";
import { planProjectBackfill } from "../../modules/task/team/cc-project-backfill-plan.js";
import { planProjectRenames, planTeamBindings } from "../../modules/task/team/cc-project-plan.js";

describe("planProjectRenames", () => {
  it("maps retired renamed_from codes to the new code", () => {
    expect(planProjectRenames([
      { code: "LP", renamedFrom: ["LwP"] },
      { code: "At", renamedFrom: [] },
    ])).toEqual([{ from: "LwP", to: "LP" }]);
  });

  it("does not move tasks of a code that is still registered, comparing case-sensitively", () => {
    expect(planProjectRenames([
      { code: "LP", renamedFrom: ["Lp", "LwP"] },
      { code: "Lp", renamedFrom: [] },
    ])).toEqual([{ from: "LwP", to: "LP" }]);
  });

  it("keeps the first owner when two projects claim the same old code", () => {
    expect(planProjectRenames([
      { code: "A", renamedFrom: ["Old"] },
      { code: "B", renamedFrom: ["Old"] },
    ])).toEqual([{ from: "Old", to: "A" }]);
  });
});

describe("planTeamBindings", () => {
  it("binds only projects whose team_ids changed to exactly one team", () => {
    const previous = new Map([["Cc", []], ["At", ["t1"]], ["Cr", ["t1"]], ["Mm", ["t1"]]]);
    expect(planTeamBindings([
      { code: "Cc", teamIds: ["t1"] },
      { code: "At", teamIds: ["t1"] },
      { code: "Cr", teamIds: ["t1", "t2"] },
      { code: "Mm", teamIds: [] },
      { code: "New", teamIds: ["t3"] },
    ], previous)).toEqual([
      { code: "Cc", teamId: "t1" },
      { code: "New", teamId: "t3" },
    ]);
  });

  it("treats a reordered team list as unchanged", () => {
    expect(planTeamBindings([{ code: "At", teamIds: ["t1"] }], new Map([["At", ["t1"]]]))).toEqual([]);
  });
});

describe("planProjectBackfill", () => {
  const projects = [
    { code: "LP", teamIds: ["t1"] },
    { code: "Cr", teamIds: ["t1", "t2"] },
    { code: "Aes", teamIds: [] },
  ];
  const task = (id: string, projectId: string | null, teamId: string | null = null, sprintId: string | null = null) =>
    ({ id, projectId, teamId, sprintId });

  it("lists renames, single-team bindings and multi-team rows separately", () => {
    const plan = planProjectBackfill([
      task("1", "LwP"),
      task("2", "LP"),
      task("3", "Cr"),
      task("4", "Aes"),
      task("5", null),
      task("6", "LP", "t1"),
      task("7", "LP", null, "sprint-1"),
    ], projects, [{ from: "LwP", to: "LP" }]);
    expect(plan.renames).toEqual([{ taskId: "1", from: "LwP", to: "LP" }]);
    expect(plan.teamBindings).toEqual([
      { taskId: "1", projectId: "LP", teamId: "t1" },
      { taskId: "2", projectId: "LP", teamId: "t1" },
    ]);
    expect(plan.multiTeam).toEqual([{ taskId: "3", projectId: "Cr", teamIds: ["t1", "t2"] }]);
  });
});
