/**
 * ゴンペルツ曲線の入力となる累積バグ数の日次系列 (純粋関数, PLAN §4.3)
 *
 * 発見日はタスクを取り込んだ日、修正日は close を検知した日 (スナップショット) を使う。
 * 以前はタスク作成日で修正数も数えていたため、修正の推移が発見の推移に重なっていた。
 */

export interface BugTask {
  id: string;
  labels: readonly string[];
  status: string;
  createdAt: Date;
}

export interface BugClosure {
  taskId: string;
  closedAt: Date;
}

export interface BugSeriesPoint {
  date: string;
  cumulativeFound: number;
  cumulativeFixed: number;
}

export function isBugTask(labels: readonly string[]): boolean {
  return labels.some((label) => label.toLowerCase().includes("bug"));
}

function day(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function buildBugSeries(tasks: readonly BugTask[], closures: readonly BugClosure[]): BugSeriesPoint[] {
  const bugs = tasks.filter((t) => isBugTask(t.labels));
  const bugIds = new Set(bugs.map((t) => t.id));
  // 修正済みは今 closed のタスクだけ。複数回 close されていれば最後の close の日に数える
  const closedIds = new Set(bugs.filter((t) => t.status === "closed").map((t) => t.id));
  const lastClosure = new Map<string, Date>();
  for (const closure of closures) {
    if (!bugIds.has(closure.taskId) || !closedIds.has(closure.taskId)) continue;
    const prev = lastClosure.get(closure.taskId);
    if (!prev || closure.closedAt > prev) lastClosure.set(closure.taskId, closure.closedAt);
  }
  // 取り込んだ時点で既に closed だったものは close の検知記録が無いので、取り込み日に数える
  for (const bug of bugs) {
    if (closedIds.has(bug.id) && !lastClosure.has(bug.id)) lastClosure.set(bug.id, bug.createdAt);
  }

  const found = new Map<string, number>();
  for (const bug of bugs) found.set(day(bug.createdAt), (found.get(day(bug.createdAt)) ?? 0) + 1);
  const fixed = new Map<string, number>();
  for (const closedAt of lastClosure.values()) fixed.set(day(closedAt), (fixed.get(day(closedAt)) ?? 0) + 1);

  const dates = [...new Set([...found.keys(), ...fixed.keys()])].sort();
  let cumulativeFound = 0;
  let cumulativeFixed = 0;
  return dates.map((date) => {
    cumulativeFound += found.get(date) ?? 0;
    cumulativeFixed += fixed.get(date) ?? 0;
    return { date, cumulativeFound, cumulativeFixed };
  });
}
