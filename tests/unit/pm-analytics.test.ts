import { describe, expect, it } from "vitest";
import { buildBugSeries } from "../../modules/pm/analytics/bug-series.js";
import { forecastProgress } from "../../modules/pm/analytics/progress-forecast.js";
import { findOverdueTasks, findWarningTasks, isPastDailyCheckTime, resolveReminderSettings, reminderSettingsSchema } from "../../modules/pm/reminder/deadline-checker.js";
import { matchTestFiles } from "../../modules/pm/validation/test-matching.js";

const DAY = 86_400_000;

describe("forecastProgress (AT-PM-ANALYTICS)", () => {
  const now = new Date("2026-10-02T00:00:00Z");

  it("projects from each assignee's recent completion pace", () => {
    const closures = Array.from({ length: 7 }, (_, i) => ({ taskId: `c${i}`, assignees: ["alice"], closedAt: new Date(now.getTime() - i * DAY) }));
    const tasks = [
      { id: "a1", status: "open", assignees: ["alice"] },
      { id: "a2", status: "open", assignees: ["alice"] },
    ];
    // 7 件 / 14 日 = 0.5 件/日 → 残 2 件で 4 日
    const forecast = forecastProgress(tasks, closures, now);
    expect(forecast.projectedCompletionDate).toBe("2026-10-06");
  });

  it("returns null when someone with remaining work has no observed pace", () => {
    const closures = [{ taskId: "c", assignees: ["alice"], closedAt: now }];
    const forecast = forecastProgress([{ id: "b1", status: "open", assignees: ["bob"] }], closures, now);
    expect(forecast.projectedCompletionDate).toBeNull();
  });

  it("counts only critical-path tasks when a path is given", () => {
    const closures = [{ taskId: "c", assignees: ["alice"], closedAt: now }];
    const tasks = [
      { id: "cp", status: "open", assignees: ["alice"] },
      { id: "off", status: "open", assignees: ["bob"] },
    ];
    expect(forecastProgress(tasks, closures, now, new Set(["cp"])).projectedCompletionDate).not.toBeNull();
  });
});

describe("buildBugSeries", () => {
  it("counts fixes on the day they were closed, not the day they were found", () => {
    const series = buildBugSeries(
      [
        { id: "b1", labels: ["bug"], status: "closed", createdAt: new Date("2026-09-01T00:00:00Z") },
        { id: "b2", labels: ["Bug"], status: "open", createdAt: new Date("2026-09-02T00:00:00Z") },
        { id: "f1", labels: ["feature"], status: "closed", createdAt: new Date("2026-09-01T00:00:00Z") },
      ],
      [
        { taskId: "b1", closedAt: new Date("2026-09-05T00:00:00Z") },
        { taskId: "b2", closedAt: new Date("2026-09-03T00:00:00Z") },
      ],
    );
    expect(series).toEqual([
      { date: "2026-09-01", cumulativeFound: 1, cumulativeFixed: 0 },
      { date: "2026-09-02", cumulativeFound: 2, cumulativeFixed: 0 },
      { date: "2026-09-05", cumulativeFound: 2, cumulativeFixed: 1 },
    ]);
  });
});

describe("reminder settings (AT-PM-REMINDER)", () => {
  it("validates stored values and falls back to defaults", () => {
    expect(reminderSettingsSchema.safeParse({ deadlineWarningDays: 3, dailyCheckEnabled: true, dailyCheckTime: "25:00", overdueCheckEnabled: true }).success).toBe(false);
    expect(resolveReminderSettings(null).deadlineWarningDays).toBe(3);
    expect(resolveReminderSettings({ deadlineWarningDays: 7 }).deadlineWarningDays).toBe(7);
    expect(resolveReminderSettings({ deadlineWarningDays: "x" }).deadlineWarningDays).toBe(3);
  });

  it("sends after the configured local time", () => {
    const settings = resolveReminderSettings({ dailyCheckTime: "09:00" });
    expect(isPastDailyCheckTime(settings, new Date(2026, 9, 2, 8, 59))).toBe(false);
    expect(isPastDailyCheckTime(settings, new Date(2026, 9, 2, 9, 0))).toBe(true);
  });

  it("uses local dates for the warning window and overdue", () => {
    const today = new Date(2026, 9, 2, 8, 0);
    const tasks = [
      { id: "1", title: "a", dueDate: "2026-10-02", assignees: [], projectId: "p", status: "open" },
      { id: "2", title: "b", dueDate: "2026-10-05", assignees: [], projectId: "p", status: "open" },
      { id: "3", title: "c", dueDate: "2026-10-01", assignees: [], projectId: "p", status: "open" },
      { id: "4", title: "d", dueDate: "2026-10-01", assignees: [], projectId: "p", status: "closed" },
    ];
    expect(findWarningTasks(tasks, resolveReminderSettings(null), today).map((t) => t.id)).toEqual(["1", "2"]);
    expect(findOverdueTasks(tasks, today).map((t) => t.id)).toEqual(["3"]);
  });
});

describe("matchTestFiles (AT-PM-VALIDATION)", () => {
  it("finds changed tests and tests with the same basename", () => {
    const result = matchTestFiles(["src/auth.ts", "README.md"], ["src/auth.ts", "tests/auth.test.ts", "tests/other.spec.ts"]);
    expect(result).toEqual({ testFiles: ["tests/auth.test.ts"], testCoverage: "found" });
    expect(matchTestFiles(["tests/a.spec.ts"], null)).toEqual({ testFiles: ["tests/a.spec.ts"], testCoverage: "found" });
  });

  it("distinguishes missing from unknown", () => {
    expect(matchTestFiles(["src/x.ts"], ["src/x.ts"]).testCoverage).toBe("missing");
    expect(matchTestFiles(["src/x.ts"], null).testCoverage).toBe("unknown");
    expect(matchTestFiles([], []).testCoverage).toBe("unknown");
  });
});
