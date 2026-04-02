/**
 * クリティカルパス検知 & タスク分解判断
 */

import type { CriticalPathResult, CriticalPathNode, DecompositionRecommendation } from "../types.js";

interface TaskForAnalysis {
  id: string;
  title: string;
  status: string;
  estimatedHours: number | null;
  assignees: string[];
  blockedBy: string[];
  dueDate: string | null;
}

const HOURS_PER_DAY = 8;

/**
 * DAG の最長パス (クリティカルパス) を計算する
 */
export function calculateCriticalPath(tasks: TaskForAnalysis[]): CriticalPathResult {
  if (tasks.length === 0) {
    return {
      path: [],
      totalEstimatedDays: 0,
      projectedCompletionDate: new Date().toISOString().split("T")[0],
      riskLevel: "low",
    };
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  // adj[id] = 依存先タスクID リスト (id が完了しないと始められないタスク)
  const dependents = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const task of tasks) {
    if (!dependents.has(task.id)) dependents.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  for (const task of tasks) {
    for (const dep of task.blockedBy) {
      if (taskMap.has(dep)) {
        dependents.get(dep)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      }
    }
  }

  // トポロジカルソートで最長パスを計算
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const queue: string[] = [];

  for (const task of tasks) {
    const deg = inDegree.get(task.id) ?? 0;
    const est = (task.estimatedHours ?? HOURS_PER_DAY) / HOURS_PER_DAY;
    dist.set(task.id, est);
    prev.set(task.id, null);
    if (deg === 0) queue.push(task.id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = dist.get(current) ?? 0;

    for (const next of dependents.get(current) ?? []) {
      const nextEst = ((taskMap.get(next)?.estimatedHours ?? HOURS_PER_DAY) / HOURS_PER_DAY);
      const newDist = currentDist + nextEst;
      if (newDist > (dist.get(next) ?? 0)) {
        dist.set(next, newDist);
        prev.set(next, current);
      }
      inDegree.set(next, (inDegree.get(next) ?? 1) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  // 最長パスの終端を見つける
  let maxDist = 0;
  let endNode = tasks[0].id;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // パスを逆順に復元
  const pathIds: string[] = [];
  let current: string | null = endNode;
  while (current) {
    pathIds.unshift(current);
    current = prev.get(current) ?? null;
  }

  const path: CriticalPathNode[] = pathIds.map((id) => {
    const task = taskMap.get(id)!;
    return {
      taskId: task.id,
      title: task.title,
      estimatedDays: (task.estimatedHours ?? HOURS_PER_DAY) / HOURS_PER_DAY,
      assignee: task.assignees[0] ?? "未割り当て",
      status: task.status,
    };
  });

  const totalEstimatedDays = Math.ceil(maxDist);
  const projectedDate = new Date();
  projectedDate.setDate(projectedDate.getDate() + totalEstimatedDays);

  // リスクレベル判定
  let riskLevel: CriticalPathResult["riskLevel"] = "low";
  const openOnPath = path.filter((n) => n.status !== "closed").length;
  if (openOnPath > 10 || totalEstimatedDays > 60) riskLevel = "critical";
  else if (openOnPath > 5 || totalEstimatedDays > 30) riskLevel = "high";
  else if (openOnPath > 2 || totalEstimatedDays > 14) riskLevel = "medium";

  return {
    path,
    totalEstimatedDays,
    projectedCompletionDate: projectedDate.toISOString().split("T")[0],
    riskLevel,
  };
}

/**
 * タスク分解推奨リストを生成
 */
export function findDecompositionCandidates(
  tasks: TaskForAnalysis[],
  criticalPathIds: Set<string>
): DecompositionRecommendation[] {
  const recommendations: DecompositionRecommendation[] = [];

  // チーム平均の見積もり工数
  const estimatedTasks = tasks.filter((t) => t.estimatedHours !== null && t.estimatedHours > 0);
  const avgHours = estimatedTasks.length > 0
    ? estimatedTasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0) / estimatedTasks.length
    : HOURS_PER_DAY;

  for (const task of tasks) {
    if (task.status === "closed") continue;

    const reasons: string[] = [];
    const est = task.estimatedHours ?? 0;

    // 見積もり工数がチーム平均の 2倍以上
    if (est > avgHours * 2 && est > 0) {
      reasons.push(`見積もり(${est}h)がチーム平均(${avgHours.toFixed(1)}h)の2倍以上`);
    }

    // クリティカルパス上かつ単一担当
    if (criticalPathIds.has(task.id) && task.assignees.length <= 1) {
      reasons.push("クリティカルパス上の単一担当タスク — 並列化を検討");
    }

    // 依存タスクが 3 つ以上 → ボトルネック
    const dependentCount = tasks.filter((t) => t.blockedBy.includes(task.id)).length;
    if (dependentCount >= 3) {
      reasons.push(`${dependentCount}個のタスクがこのタスクに依存 — ボトルネック`);
    }

    if (reasons.length > 0) {
      recommendations.push({
        taskId: task.id,
        title: task.title,
        reason: reasons.join("; "),
        estimatedHours: task.estimatedHours,
        dependencyCount: dependentCount,
        onCriticalPath: criticalPathIds.has(task.id),
      });
    }
  }

  return recommendations.sort((a, b) => {
    // クリティカルパス上のタスクを優先
    if (a.onCriticalPath !== b.onCriticalPath) return a.onCriticalPath ? -1 : 1;
    return b.dependencyCount - a.dependencyCount;
  });
}
