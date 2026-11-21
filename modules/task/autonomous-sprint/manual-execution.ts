import { PlanningError } from "../planning/contracts.js";
import { all, type Program } from "../sprint-gates/query.js";
import { findLoop } from "./persistence.js";

export function* assertNoManualExecution(teamId: string, taskIds: string[]): Program<void> {
  if (taskIds.length === 0) return;
  const active = yield* all<{ taskIds: string }>(`SELECT task_ids AS taskIds FROM terpsichore_runs
    WHERE team_id=? AND state IN ('submitting', 'running', 'unknown')`, teamId);
  const scope = new Set(taskIds);
  for (const row of active) {
    const reserved: unknown = JSON.parse(row.taskIds);
    if (!Array.isArray(reserved) || reserved.some(id => scope.has(id))) {
      throw new PlanningError("対象タスクに手動委託が残っています。受付結果と完了を確認してください", 409);
    }
  }
}

export function* assertNoAutonomousTasks(teamId: string, taskIds: string[]): Program<void> {
  const run = yield* findLoop(teamId);
  if (!run) return;
  const owned = yield* all<{ id: string }>("SELECT id FROM tasks WHERE team_id=? AND sprint_id=?", teamId, run.sprintId);
  const outgoing = new Set(taskIds);
  if (owned.some(task => outgoing.has(task.id))) throw new PlanningError("自律スプリントのタスクは dots が管制します", 409);
}
