import { describe, expect, it } from "vitest";
import { computeCriticalPath, resolveDuration, type CriticalPathTaskInput } from "../../modules/task/critical-path/compute.js";

function task(id: string, overrides: Partial<CriticalPathTaskInput> = {}): CriticalPathTaskInput {
  return { id, status: "open", lane: "backlog", blockedBy: [], durationDays: 1, estimatedMinutes: null, ...overrides };
}

describe("computeCriticalPath", () => {
  it("marks the longest dependency chain as critical and gives others slack", () => {
    const result = computeCriticalPath([
      task("A", { durationDays: 2 }),
      task("B", { durationDays: 2, blockedBy: ["A"] }),
      task("C", { durationDays: 2, blockedBy: ["B"] }),
      task("D", { durationDays: 1 }),
    ], 120);
    expect(result.taskIds).toEqual(["A", "B", "C"]);
    expect(result.totalDays).toBe(6);
    expect(result.tasks.find((t) => t.id === "D")?.slackDays).toBe(5);
    expect(result.cycles).toEqual([]);
  });

  it("marks every zero-slack branch when two chains tie", () => {
    const result = computeCriticalPath([
      task("A", { durationDays: 1 }),
      task("B", { durationDays: 2, blockedBy: ["A"] }),
      task("C", { durationDays: 2, blockedBy: ["A"] }),
    ], 120);
    expect(result.taskIds).toEqual(["A", "B", "C"]);
  });

  it("ignores finished, daily and foreign dependencies", () => {
    const result = computeCriticalPath([
      task("done", { status: "done", durationDays: 10 }),
      task("daily", { lane: "daily", durationDays: 10 }),
      task("A", { durationDays: 3, blockedBy: ["done", "daily", "foreign"] }),
    ], 120);
    expect(result.tasks.map((t) => t.id)).toEqual(["A"]);
    expect(result.tasks[0].earliestStart).toBe(0);
    expect(result.taskIds).toEqual(["A"]);
  });

  it("reports cycles and leaves cyclic tasks out of the calculation", () => {
    const result = computeCriticalPath([
      task("X", { blockedBy: ["Y"] }),
      task("Y", { blockedBy: ["X"] }),
      task("Z", { durationDays: 2 }),
    ], 120);
    expect(result.cycles).toEqual([["X", "Y"]]);
    expect(result.tasks.map((t) => t.id)).toEqual(["Z"]);
    expect(result.taskIds).toEqual(["Z"]);
  });
});

describe("resolveDuration", () => {
  it("prefers duration_days, then the estimate, then one day", () => {
    expect(resolveDuration({ durationDays: 3, estimatedMinutes: 600 }, 120)).toEqual({ days: 3, source: "duration_days" });
    expect(resolveDuration({ durationDays: null, estimatedMinutes: 250 }, 120)).toEqual({ days: 3, source: "estimate" });
    expect(resolveDuration({ durationDays: null, estimatedMinutes: null }, 120)).toEqual({ days: 1, source: "default" });
  });
});
