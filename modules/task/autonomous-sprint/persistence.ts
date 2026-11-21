// @spec 自律スプリントの管制 API
import { PlanningError } from "../planning/contracts.js";
import { all, exec, one, type Program } from "../sprint-gates/query.js";
import { ownsLoop } from "./access.js";
import type { LoopRun } from "./contracts.js";

const columns = `id, team_id AS teamId, sprint_id AS sprintId, client_id AS clientId,
  status, revision, cycle, stalled_after_minutes AS stalledAfterMinutes, next_sprint_id AS nextSprintId,
  claim_id AS claimId, task_id AS taskId, claimed_at AS claimedAt, warning`;

export function* findLoop(teamId: string): Program<LoopRun | undefined> {
  return yield* one<LoopRun>(`SELECT ${columns} FROM autonomous_sprint_runs WHERE team_id=?`, teamId);
}

export function* scanLoops(): Program<LoopRun[]> {
  return yield* all<LoopRun>(`SELECT ${columns} FROM autonomous_sprint_runs WHERE status='running' ORDER BY team_id`);
}

export function* getLoop(teamId: string, clientId?: string): Program<LoopRun> {
  const run = yield* findLoop(teamId);
  if (!run || (clientId !== undefined && !ownsLoop(clientId, run.clientId))) {
    throw new PlanningError("このチームの自律スプリントが見つかりません", 404);
  }
  return run;
}

export function* assertManualSprint(teamId: string, sprintId: string): Program<void> {
  if ((yield* findLoop(teamId))?.sprintId === sprintId) {
    throw new PlanningError("このスプリントは自律モードで管理されています", 409);
  }
}

export function* recordLoop(run: LoopRun, action: string, actor: string, reason: string, now: Date): Program<void> {
  // Omit the API client binding from the historical snapshot.
  const { clientId: _binding, ...state } = run;
  yield* exec(`INSERT INTO autonomous_sprint_events
    (run_id,revision,team_id,sprint_id,action,actor_id,reason,state_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`, run.id, run.revision, run.teamId, run.sprintId, action, actor, reason, JSON.stringify(state), now.toISOString());
}

export function* changeLoop(
  prior: LoopRun,
  patch: Partial<Omit<LoopRun, "id" | "teamId" | "clientId" | "revision">>,
  action: string,
  actor: string,
  reason: string,
  now: Date,
): Program<LoopRun> {
  const run = { ...prior, ...patch, revision: prior.revision + 1 };
  const saved = yield* one<{ id: string }>(`UPDATE autonomous_sprint_runs SET
    sprint_id=?, status=?, revision=?, cycle=?, stalled_after_minutes=?, next_sprint_id=?,
    claim_id=?, task_id=?, claimed_at=?, warning=? WHERE id=? AND revision=? RETURNING id`,
  run.sprintId, run.status, run.revision, run.cycle, run.stalledAfterMinutes, run.nextSprintId,
  run.claimId, run.taskId, run.claimedAt, run.warning, run.id, prior.revision);
  if (!saved) throw new PlanningError("自律スプリントの状態が変更されました", 409);
  yield* recordLoop(run, action, actor, reason, now);
  return run;
}

export function assertRevision(run: LoopRun, expected: number): void {
  if (run.revision !== expected) throw new PlanningError("自律スプリントの最新版を読み直してください", 409);
}

export const loopActor = (run: LoopRun): string => `autonomous-sprint:${run.id}`;
