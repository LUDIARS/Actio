/**
 * 進捗率の未来予測 (純粋関数, PLAN §4.1, completion.md AT-PM-ANALYTICS)
 *
 * 担当者ごとに直近 windowDays 日の完了数から完了速度 (件/日) を出し、残タスクを消化する日数を求める。
 * クリティカルパスが分かっていれば残タスクはパス上のものだけで数える。
 * 観測された完了が無い担当者に残タスクがあれば予測できない (null)。
 */

export const DEFAULT_FORECAST_WINDOW_DAYS = 14;
const UNASSIGNED = "(unassigned)";
const DAY_MS = 86_400_000;

export interface ForecastTask {
  id: string;
  status: string;
  assignees: readonly string[];
}

export interface TaskClosure {
  taskId: string;
  assignees: readonly string[];
  closedAt: Date;
}

export interface AssigneeForecast {
  assignee: string;
  remainingTasks: number;
  velocityPerDay: number;
  daysToFinish: number | null;
}

export interface ProgressForecast {
  windowDays: number;
  projectedCompletionDate: string | null;
  assignees: AssigneeForecast[];
}

function ownerOf(assignees: readonly string[]): string {
  return assignees[0] ?? UNASSIGNED;
}

export function forecastProgress(
  tasks: readonly ForecastTask[],
  closures: readonly TaskClosure[],
  now: Date,
  criticalPathIds: ReadonlySet<string> = new Set(),
  windowDays: number = DEFAULT_FORECAST_WINDOW_DAYS,
): ProgressForecast {
  const windowStart = now.getTime() - windowDays * DAY_MS;
  const recent = closures.filter((c) => c.closedAt.getTime() >= windowStart && c.closedAt.getTime() <= now.getTime());

  const closedByAssignee = new Map<string, number>();
  for (const closure of recent) {
    const owner = ownerOf(closure.assignees);
    closedByAssignee.set(owner, (closedByAssignee.get(owner) ?? 0) + 1);
  }
  const teamVelocity = recent.length / windowDays;

  const remaining = tasks.filter((t) => t.status !== "closed" && (criticalPathIds.size === 0 || criticalPathIds.has(t.id)));
  const remainingByAssignee = new Map<string, number>();
  for (const task of remaining) {
    const owner = ownerOf(task.assignees);
    remainingByAssignee.set(owner, (remainingByAssignee.get(owner) ?? 0) + 1);
  }

  const assignees: AssigneeForecast[] = [...remainingByAssignee.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([assignee, remainingTasks]) => {
      // 未割り当てのタスクはチーム全体の速度で消化すると見なす
      const velocityPerDay = assignee === UNASSIGNED ? teamVelocity : (closedByAssignee.get(assignee) ?? 0) / windowDays;
      const daysToFinish = velocityPerDay > 0 ? remainingTasks / velocityPerDay : null;
      return { assignee, remainingTasks, velocityPerDay, daysToFinish };
    });

  if (remaining.length === 0) {
    return { windowDays, projectedCompletionDate: now.toISOString().split("T")[0], assignees };
  }
  if (assignees.some((a) => a.daysToFinish === null)) {
    return { windowDays, projectedCompletionDate: null, assignees };
  }
  const days = Math.max(...assignees.map((a) => a.daysToFinish ?? 0));
  const projected = new Date(now.getTime() + Math.ceil(days) * DAY_MS);
  return { windowDays, projectedCompletionDate: projected.toISOString().split("T")[0], assignees };
}
