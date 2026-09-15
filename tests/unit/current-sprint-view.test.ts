import { describe, expect, it } from "vitest";
import { selectCurrentSprintView } from "../../modules/task/views/current-sprint-view.js";

const sprints = [
  { id: "past", status: "closed" },
  { id: "now", status: "active" },
  { id: "next", status: "planning" },
];

function task(id: string, lane: string, sprintId: string | null, status = "open") {
  return { id, lane, sprintId, status };
}

describe("selectCurrentSprintView", () => {
  it("keeps the active sprint and unassigned open backlog only", () => {
    const view = selectCurrentSprintView([
      task("in-now", "backlog", "now"),
      task("done-in-now", "backlog", "now", "done"),
      task("backlog", "backlog", null),
      task("backlog-done", "backlog", null, "done"),
      task("in-past", "backlog", "past"),
      task("in-next", "backlog", "next"),
      task("daily", "daily", null),
    ], sprints);
    expect(view.currentSprint?.id).toBe("now");
    expect(view.tasks.map((t) => t.id)).toEqual(["in-now", "done-in-now", "backlog"]);
  });

  it("returns unassigned backlog with a null sprint when none is active", () => {
    const view = selectCurrentSprintView([task("backlog", "backlog", null), task("in-next", "backlog", "next")], [{ id: "next", status: "planning" }]);
    expect(view.currentSprint).toBeNull();
    expect(view.tasks.map((t) => t.id)).toEqual(["backlog"]);
  });
});
