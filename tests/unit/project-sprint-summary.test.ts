import { describe, expect, it } from "vitest";
import { summarizeProjectSprints, type ProjectSprintTeamInput } from "../../modules/task/planning/project-sprint-summary.js";
import type { BacklogTask, Sprint } from "../../modules/task/planning/contracts.js";

const now = new Date("2026-09-26T03:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

function sprint(id: string, status: Sprint["status"], startsOn: string, overrides: Partial<Sprint> = {}): Sprint {
  return { id, teamId: "team-1", name: `Sprint ${id}`, goal: `goal ${id}`, status, startsOn, endsOn: startsOn,
    originalEndsOn: startsOn, bufferEndsOn: startsOn, cadenceDays: 14, capacityMinutes: 4800, revision: 3, ...overrides };
}

function task(id: string, overrides: Partial<BacklogTask> = {}): BacklogTask {
  return { id, title: `secret title ${id}`, description: `secret description ${id}`, requirements: null, status: "open",
    priority: "medium", assigneeId: `assignee-${id}`, projectId: "KD", deadline: null, estimatedMinutes: null,
    sprintId: "active", category: null, groupId: null, position: 0, fingerprint: `fp-${id}`, executorType: "human",
    isCriticalPath: 0, ...overrides };
}

function team(sprints: Sprint[], tasks: BacklogTask[]): ProjectSprintTeamInput {
  return { teamId: "team-1", teamName: "KonbiniDominant", sprints, tasks };
}

const activeSprint = sprint("active", "active", "2026-09-22", {
  endsOn: "2026-10-05", originalEndsOn: "2026-10-05", bufferEndsOn: "2026-10-07",
});

describe("summarizeProjectSprints", () => {
  it("returns an empty team list and the generation time", () => {
    expect(summarizeProjectSprints("KD", [], now)).toEqual({ project: "KD", generatedAt: "2026-09-26T03:00:00.000Z", teams: [] });
  });

  it("reports a null active sprint and counts only open unassigned backlog", () => {
    const summary = summarizeProjectSprints("KD", [team([sprint("next", "planning", "2026-10-06")], [
      task("a", { sprintId: null }),
      task("b", { sprintId: null, projectId: "Other" }),
      task("c", { sprintId: null, status: "done" }),
      task("d", { sprintId: null, status: "cancelled" }),
      task("e", { sprintId: "next" }),
    ])], now);
    expect(summary.teams[0]).toMatchObject({ teamId: "team-1", teamName: "KonbiniDominant", activeSprint: null,
      backlogUnassigned: { total: 2, project: 1 } });
  });

  it("copies sprint metadata and counts all sprint work by raw status", () => {
    const summary = summarizeProjectSprints("KD", [team([activeSprint], [
      task("a"), task("b", { status: "in_progress" }), task("c", { status: "done" }),
      task("d", { status: "cancelled", projectId: "Other" }), task("outside", { sprintId: null }),
    ])], now);
    expect(summary.teams[0].activeSprint).toMatchObject({
      id: "active", name: "Sprint active", goal: "goal active", status: "active", startsOn: "2026-09-22",
      endsOn: "2026-10-05", originalEndsOn: "2026-10-05", bufferEndsOn: "2026-10-07", cadenceDays: 14,
      capacityMinutes: 4800, revision: 3,
    });
    expect(summary.teams[0].activeSprint?.tasks).toMatchObject({
      total: 4, byStatus: { open: 1, in_progress: 1, done: 1, cancelled: 1 },
      project: { total: 3, byStatus: { open: 1, in_progress: 1, done: 1 } },
    });
  });

  it("returns zero project counts when the sprint has no task of the project", () => {
    const summary = summarizeProjectSprints("KD", [team([activeSprint], [task("a", { projectId: "Other" }), task("b", { projectId: null })])], now);
    expect(summary.teams[0].activeSprint?.tasks.total).toBe(2);
    expect(summary.teams[0].activeSprint?.tasks.project).toEqual({ total: 0, byStatus: {} });
  });

  it("counts overdue as unfinished work whose deadline is before now", () => {
    const summary = summarizeProjectSprints("KD", [team([activeSprint], [
      task("late", { deadline: nowSeconds - 60 }),
      task("late-done", { deadline: nowSeconds - 60, status: "done" }),
      task("late-cancelled", { deadline: nowSeconds - 60, status: "cancelled" }),
      task("future", { deadline: nowSeconds + 60 }),
      task("no-deadline"),
      task("late-outside", { deadline: nowSeconds - 60, sprintId: null }),
    ])], now);
    expect(summary.teams[0].activeSprint?.tasks.overdue).toBe(1);
  });

  it("splits sprint work by executor, defaulting to human", () => {
    const summary = summarizeProjectSprints("KD", [team([activeSprint], [
      task("ai-1", { executorType: "ai" }), task("ai-2", { executorType: "ai", status: "done" }),
      task("human"), task("legacy", { executorType: undefined }),
    ])], now);
    expect(summary.teams[0].activeSprint?.tasks.byExecutor).toEqual({ human: 2, ai: 2 });
  });

  it("counts unfinished critical-path work in both dialect encodings", () => {
    const summary = summarizeProjectSprints("KD", [team([activeSprint], [
      task("sqlite", { isCriticalPath: 1 }), task("postgres", { isCriticalPath: true }),
      task("done", { isCriticalPath: 1, status: "done" }), task("slack", { isCriticalPath: 0 }),
      task("outside", { isCriticalPath: 1, sprintId: null }),
    ])], now);
    expect(summary.teams[0].activeSprint?.tasks.criticalPath).toBe(2);
  });

  it("sums estimates without cancelled work and reports done minutes", () => {
    const summary = summarizeProjectSprints("KD", [team([activeSprint], [
      task("open", { estimatedMinutes: 120 }), task("unknown", { estimatedMinutes: null }),
      task("done", { estimatedMinutes: 60, status: "done" }), task("cancelled", { estimatedMinutes: 500, status: "cancelled" }),
      task("outside", { estimatedMinutes: 1000, sprintId: null }),
    ])], now);
    expect(summary.teams[0].activeSprint?.tasks).toMatchObject({ estimatedMinutes: 180, doneMinutes: 60 });
  });

  it("lists planning sprints by start date then id, without active or closed ones", () => {
    const summary = summarizeProjectSprints("KD", [team([
      sprint("later", "planning", "2026-10-20"), sprint("b", "planning", "2026-10-06"), activeSprint,
      sprint("a", "planning", "2026-10-06"), sprint("past", "closed", "2026-09-01"),
    ], [])], now);
    expect(summary.teams[0].planningSprints).toEqual([
      { id: "a", name: "Sprint a", startsOn: "2026-10-06", endsOn: "2026-10-06" },
      { id: "b", name: "Sprint b", startsOn: "2026-10-06", endsOn: "2026-10-06" },
      { id: "later", name: "Sprint later", startsOn: "2026-10-20", endsOn: "2026-10-20" },
    ]);
  });

  it("does not expose task ids, titles, descriptions or assignees", () => {
    const serialized = JSON.stringify(summarizeProjectSprints("KD", [team([activeSprint], [
      task("task-in-sprint"), task("task-in-backlog", { sprintId: null }),
    ])], now));
    for (const leaked of ["task-in-sprint", "task-in-backlog", "secret title", "secret description", "assignee-", "fp-"]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});
