/**
 * チームのバックログ依存 DAG からクリティカルパスとスラックを計算する (純粋関数)。
 * spec/feature/task-integration/spec.md §5.1
 *
 * PM モジュールの calculateCriticalPath (時間単位・単一経路) とは別物。 こちらは
 * 日数単位で前進・後退計算を行い、 スラック 0 のタスクを全部クリティカルとする。
 */

export type DurationSource = "duration_days" | "estimate" | "default";

export interface CriticalPathTaskInput {
  id: string;
  status: string;
  lane: string;
  blockedBy: readonly string[];
  durationDays: number | null;
  estimatedMinutes: number | null;
}

export interface CriticalPathTaskResult {
  id: string;
  durationDays: number;
  durationSource: DurationSource;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slackDays: number;
  isCriticalPath: boolean;
}

export interface CriticalPathResult {
  /** クリティカルパス上のタスク id (最早開始順)。 */
  taskIds: string[];
  /** 計算対象全体の所要日数。 */
  totalDays: number;
  tasks: CriticalPathTaskResult[];
  /** 循環している依存の組。 これらはクリティカル判定から外す。 */
  cycles: string[][];
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const DEFAULT_DURATION_DAYS = 1;
const SLACK_EPSILON = 1e-9;

export function isCriticalPathTarget(task: Pick<CriticalPathTaskInput, "status" | "lane">): boolean {
  return task.lane === "backlog" && !CLOSED_STATUSES.has(task.status);
}

export function resolveDuration(
  task: Pick<CriticalPathTaskInput, "durationDays" | "estimatedMinutes">,
  defaultDailyMinutes: number,
): { days: number; source: DurationSource } {
  if (task.durationDays != null && task.durationDays > 0) return { days: task.durationDays, source: "duration_days" };
  if (task.estimatedMinutes != null && task.estimatedMinutes > 0 && defaultDailyMinutes > 0) {
    return { days: Math.ceil(task.estimatedMinutes / defaultDailyMinutes), source: "estimate" };
  }
  return { days: DEFAULT_DURATION_DAYS, source: "default" };
}

/** Tarjan の強連結成分で循環 (2 件以上、 または自己参照) を取り出す。 */
function findCycles(ids: readonly string[], predecessors: ReadonlyMap<string, readonly string[]>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  const visit = (id: string): void => {
    indices.set(id, index);
    lowlinks.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);
    for (const pred of predecessors.get(id) ?? []) {
      if (!indices.has(pred)) {
        visit(pred);
        lowlinks.set(id, Math.min(lowlinks.get(id) ?? 0, lowlinks.get(pred) ?? 0));
      } else if (onStack.has(pred)) {
        lowlinks.set(id, Math.min(lowlinks.get(id) ?? 0, indices.get(pred) ?? 0));
      }
    }
    if (lowlinks.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    const isSelfLoop = component.length === 1 && (predecessors.get(id) ?? []).includes(id);
    if (component.length > 1 || isSelfLoop) cycles.push(component.sort());
  };

  for (const id of ids) if (!indices.has(id)) visit(id);
  return cycles;
}

export function computeCriticalPath(
  allTasks: readonly CriticalPathTaskInput[],
  defaultDailyMinutes: number,
): CriticalPathResult {
  const targets = allTasks.filter(isCriticalPathTarget);
  const targetIds = new Set(targets.map((task) => task.id));
  // Dependencies outside the target set are either finished or foreign; neither delays the plan.
  const predecessors = new Map(targets.map((task) => [task.id, task.blockedBy.filter((id) => targetIds.has(id))]));
  const cycles = findCycles(targets.map((task) => task.id), predecessors);
  const cyclic = new Set(cycles.flat());

  const nodes = targets.filter((task) => !cyclic.has(task.id));
  const nodeIds = new Set(nodes.map((task) => task.id));
  const preds = new Map(nodes.map((task) => [task.id, (predecessors.get(task.id) ?? []).filter((id) => nodeIds.has(id))]));
  const succs = new Map<string, string[]>(nodes.map((task) => [task.id, []]));
  for (const [id, list] of preds) for (const pred of list) succs.get(pred)?.push(id);

  const durations = new Map(nodes.map((task) => [task.id, resolveDuration(task, defaultDailyMinutes)]));
  const remaining = new Map(nodes.map((task) => [task.id, preds.get(task.id)?.length ?? 0]));
  const order: string[] = [];
  const queue = nodes.filter((task) => remaining.get(task.id) === 0).map((task) => task.id).sort();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of succs.get(id) ?? []) {
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(0, ...(preds.get(id) ?? []).map((pred) => earliestFinish.get(pred) ?? 0));
    earliestStart.set(id, start);
    earliestFinish.set(id, start + (durations.get(id)?.days ?? DEFAULT_DURATION_DAYS));
  }
  const totalDays = Math.max(0, ...earliestFinish.values());

  const latestStart = new Map<string, number>();
  const latestFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const successors = succs.get(id) ?? [];
    const finish = successors.length === 0 ? totalDays : Math.min(...successors.map((next) => latestStart.get(next) ?? totalDays));
    latestFinish.set(id, finish);
    latestStart.set(id, finish - (durations.get(id)?.days ?? DEFAULT_DURATION_DAYS));
  }

  const results: CriticalPathTaskResult[] = order.map((id) => {
    const duration = durations.get(id) ?? { days: DEFAULT_DURATION_DAYS, source: "default" as const };
    const es = earliestStart.get(id) ?? 0;
    const ls = latestStart.get(id) ?? 0;
    const slack = ls - es;
    return {
      id,
      durationDays: duration.days,
      durationSource: duration.source,
      earliestStart: es,
      earliestFinish: earliestFinish.get(id) ?? es + duration.days,
      latestStart: ls,
      latestFinish: latestFinish.get(id) ?? ls + duration.days,
      slackDays: slack,
      isCriticalPath: Math.abs(slack) < SLACK_EPSILON,
    };
  });

  const taskIds = results
    .filter((task) => task.isCriticalPath)
    .sort((a, b) => a.earliestStart - b.earliestStart || a.id.localeCompare(b.id))
    .map((task) => task.id);
  return { taskIds, totalDays, tasks: results, cycles };
}
