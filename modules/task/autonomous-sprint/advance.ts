// @spec 自律スプリントの参加と進行
import { decideSprintPhase, type SprintPhaseDecision, type SprintPhaseSnapshot, type SprintPhaseState } from "@ludiars/terpsichore";
import type { BreakerVerdict } from "./breaker.js";
import type { LoopStatus } from "./contracts.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:575423d8 */
import augurContract_ae254edc from '../../../contracts/autonomous-sprint-advance.contract.js'; /* augur-inject:contract-predicate:cfda256c */

export type LoopEffect = "observe" | "start_sprint" | "start_next_sprint" | "claim_task";

export function canAdvanceLoop(status: LoopStatus, effect: LoopEffect, breaker: BreakerVerdict | null): boolean {
  return status === "running" && (effect === "observe" || breaker === "allowed");
}
// @ts-expect-error augur-inject
canAdvanceLoop = contract(canAdvanceLoop, { ...augurContract_ae254edc, contractId: 'C-23', mode: 'observe', sample: 1, where: 'modules/task/autonomous-sprint/advance.ts:7', rule: 'contract-wrap', id: 'ae254edc' }); /* augur-inject:contract-wrap:ae254edc */

/** The opt-in owner supplies authority. Terpsichore supplies only snapshot and phase rules. */
export function decideAutonomousPhase(state: SprintPhaseState, snapshot: SprintPhaseSnapshot, now: Date): SprintPhaseDecision {
  const observed = decideSprintPhase({ state, snapshot, command: { action: "observe" }, now });
  if (observed.changed || state.held || state.phase === "implementation") return observed;
  if (state.phase === "retrospective" && !snapshot.retrospective.trim()) return observed;
  if (state.phase === "next_planning" && !snapshot.nextPlan) return observed;
  return decideSprintPhase({
    state, snapshot, now,
    command: {
      action: "approve",
      expectedRevision: state.revision,
      sourceFingerprint: state.sourceFingerprint,
      reason: "自律スプリントのポリシーに従い進行しました",
    },
  });
}
