import { PlanningError } from "../planning/contracts.js";
import { one, type Program } from "../sprint-gates/query.js";
import type { GateTask } from "../sprint-gates/contracts.js";
import type { LoopProgress, LoopRun } from "./contracts.js";

export function summarizeLoopTasks(tasks: GateTask[], run: LoopRun, now: Date): LoopProgress {
  const active = tasks.filter(t => t.status === "open" || t.status === "in_progress" || t.status === "blocked");
  const cutoff = now.getTime() - run.stalledAfterMinutes * 60_000;
  return {
    total: tasks.length,
    done: tasks.filter(t => t.status === "done").length,
    cancelled: tasks.filter(t => t.status === "cancelled").length,
    blocked: tasks.filter(t => t.status === "blocked").length,
    stalledTaskIds: active.filter(t => {
      const claimTime = t.id === run.taskId && run.claimedAt ? Date.parse(run.claimedAt) : null;
      if (t.updatedAt == null && claimTime === null) return false;
      return Math.max((t.updatedAt ?? 0) * 1000, claimTime ?? 0) <= cutoff;
    }).map(t => t.id),
  };
}

function dependencyIds(raw: unknown): string[] | null {
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null; // Malformed dependency data may not authorize work.
  }
  return Array.isArray(value) && value.every(id => typeof id === "string" && id.length > 0) ? value : null;
}

export function* eligibleTask(tasks: GateTask[], run: LoopRun, taskId: string): Program<GateTask> {
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.status !== "open" || task.executorType !== "ai" || !task.projectId || !task.assigneeId
    || (!task.description?.trim() && !task.requirements?.trim())) {
    throw new PlanningError("スプリント内の定義済み・割当済みの未着手 AI タスクを選択してください", 409);
  }
  const row = yield* one<{ blockedBy: unknown }>("SELECT blocked_by AS blockedBy FROM tasks WHERE id=? AND team_id=?", taskId, run.teamId);
  const dependencies = dependencyIds(row?.blockedBy);
  if (!dependencies) throw new PlanningError("タスクの依存関係を確認できません", 409);
  for (const dependency of new Set(dependencies)) {
    const parent = yield* one<{ status: string }>("SELECT status FROM tasks WHERE id=? AND team_id=?", dependency, run.teamId);
    if (parent?.status !== "done") throw new PlanningError("同じチームで依存先の完了を確認できません", 409);
  }
  return task;
}
