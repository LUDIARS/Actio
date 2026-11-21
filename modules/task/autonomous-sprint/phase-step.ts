import { SprintPhaseError } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
import type { GateSnapshot } from "../sprint-gates/contracts.js";
import { assertEffect, applyEffect } from "../sprint-gates/effects.js";
import { persist } from "../sprint-gates/persistence.js";
import type { GateDatabase, Program } from "../sprint-gates/query.js";
import { loadGate, loadSprint, loadTasks } from "../sprint-gates/snapshot.js";
import { canAdvanceLoop, decideAutonomousPhase, type LoopEffect } from "./advance.js";
import type { BreakerVerdict } from "./breaker.js";
import type { LoopRun, LoopWarning } from "./contracts.js";
import { assertNoManualExecution } from "./manual-execution.js";
import { changeLoop, loopActor } from "./persistence.js";
import { summarizeLoopTasks } from "./tasks.js";

export interface PermitRequest {
  effect: Exclude<LoopEffect, "observe">;
  fingerprint: string;
}
export interface Permit extends PermitRequest { verdict: BreakerVerdict }

export function breakerWarning(verdict: Exclude<BreakerVerdict, "allowed">): LoopWarning {
  return verdict === "open" ? "breaker_open" : "breaker_unavailable";
}

export function* warnLoop(run: LoopRun, warning: LoopWarning, now: Date): Program<void> {
  if (run.warning !== warning) yield* changeLoop(run, { warning }, warning, loopActor(run), warning, now);
}

function* preparePhase(run: LoopRun, now: Date): Program<{
  loaded: ReturnType<typeof loadGate> extends Program<infer T> ? T : never;
  snapshot: GateSnapshot;
  decision: ReturnType<typeof decideAutonomousPhase>;
}> {
  const loaded = yield* loadGate(run.teamId, run.sprintId);
  const snapshot = { ...loaded.snapshot };
  if (run.nextSprintId && loaded.state.phase === "next_planning") {
    const next = yield* loadSprint(run.teamId, run.nextSprintId);
    snapshot.nextPlan = { sprint: next, tasks: yield* loadTasks(run.teamId, next.id), complete: true };
  } else {
    snapshot.nextPlan = null;
  }
  if (loaded.state.phase === "retrospective" && !snapshot.retrospective.trim()) {
    const progress = summarizeLoopTasks(snapshot.tasks, run, now);
    snapshot.retrospective = `Actio の完了記録に基づく振り返り（${now.toISOString()}）。対象 ${progress.total} 件、完了 ${progress.done} 件、取消 ${progress.cancelled} 件、ブロック ${progress.blocked} 件。`;
  }
  const decision = decideAutonomousPhase(loaded.state, snapshot, now);
  yield* assertEffect(run.teamId, run.sprintId, decision.effect, snapshot.nextPlan?.sprint.id ?? null);
  if (decision.effect === "start_sprint" || decision.effect === "start_next_sprint") {
    const tasks = decision.effect === "start_sprint" ? snapshot.tasks : snapshot.nextPlan?.tasks ?? [];
    yield* assertNoManualExecution(run.teamId, tasks.map(task => task.id));
  }
  return { loaded, snapshot, decision };
}

export function* stepPhase(db: GateDatabase, run: LoopRun, now: Date, permit?: Permit): Program<PermitRequest | null> {
  if (run.status !== "running") return null;
  const actor = loopActor(run);
  if (run.taskId) {
    const tasks = (yield* loadGate(run.teamId, run.sprintId)).snapshot.tasks;
    const task = tasks.find(t => t.id === run.taskId);
    if (task?.status === "done") {
      yield* changeLoop(run, { taskId: null, claimId: null, claimedAt: null, warning: null }, "task_completed", actor, "Actio の完了を確認しました", now);
    } else if (!task || task.status === "cancelled") {
      yield* changeLoop(run, { status: "paused", warning: "scope_changed" }, "scope_changed", actor, "着手許可済みタスクの取消または移動を検出しました", now);
    } else if (summarizeLoopTasks(tasks, run, now).stalledTaskIds.includes(task.id)) {
      yield* warnLoop(run, "task_stalled", now);
    } else if (run.warning === "task_stalled") {
      yield* changeLoop(run, { warning: null }, "progress_observed", actor, "タスクの更新を確認しました", now);
    }
    return null;
  }
  let prepared: ReturnType<typeof preparePhase> extends Program<infer T> ? T : never;
  try {
    prepared = yield* preparePhase(run, now);
  } catch (error) {
    if (!(error instanceof PlanningError) && !(error instanceof SprintPhaseError)) throw error;
    yield* warnLoop(run, "phase_blocked", now);
    return null;
  }
  const { loaded, snapshot, decision } = prepared;
  const effect = decision.effect === "none" ? "observe" : decision.effect;
  if (effect !== "observe") {
    const request = { effect, fingerprint: loaded.state.sourceFingerprint };
    if (permit?.effect !== effect || permit.fingerprint !== request.fingerprint) return request;
    if (permit.verdict !== "allowed") {
      yield* warnLoop(run, breakerWarning(permit.verdict), now);
      return null;
    }
  } else if (permit) {
    return null; // A permit applies only to the prepared trigger.
  }
  if (!canAdvanceLoop(run.status, effect, permit?.verdict ?? null) || !decision.changed) return null;
  if (["retrospective", "next_planning"].includes(loaded.state.phase)
    && ["acceptance", "implementation"].includes(decision.state.phase)) {
    snapshot.retrospective = "";
    snapshot.nextPlan = null;
  }
  const nextId = snapshot.nextPlan?.sprint.id ?? null;
  yield* applyEffect(run.teamId, run.sprintId, actor, decision.effect, nextId, now, db, "autonomous");
  const after = decision.effect === "none" ? snapshot : { ...snapshot, sprint: (yield* loadGate(run.teamId, run.sprintId)).snapshot.sprint };
  const action = decision.effect === "none" ? "autonomous_phase" : decision.effect;
  const reason = decision.state.phase === loaded.state.phase || decision.effect !== "none"
    ? "スプリントの状態を更新しました" : "自律モードでフェーズを進行しました";
  yield* persist(loaded.row, decision.state, after, action, actor, reason, now, undefined, "silent");
  const rollover = effect === "start_next_sprint" && nextId !== null
    ? { sprintId: nextId, cycle: run.cycle + 1, nextSprintId: null }
    : {};
  yield* changeLoop(run, { ...rollover, warning: null }, action, actor, reason, now);
  return null;
}
