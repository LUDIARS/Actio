// @spec スプリントフェーズのAPIと画面契約
import type { BacklogTask, SprintPhaseSnapshot, SprintPhaseState, SprintPhaseCommand } from "@ludiars/terpsichore/types";
import { request } from "./api";

export interface SprintPhaseHistory {
  eventId: string; action: string; actorId: string | null; reason: string;
  phase: string; revision: number; createdAt: string;
}
/** Host-owned review evidence; the pure Tp snapshot contract stays independent. */
export interface SprintPhaseTask extends BacklogTask { completionEvidence?: string | null }
export interface SprintPhasePlan extends Omit<NonNullable<SprintPhaseSnapshot["nextPlan"]>, "tasks"> { tasks: SprintPhaseTask[] }
export interface SprintPhaseView extends Omit<SprintPhaseSnapshot, "tasks" | "nextPlan"> {
  tasks: SprintPhaseTask[];
  nextPlan: SprintPhasePlan | null;
  state: SprintPhaseState;
  nextSprintId: string | null;
  history: SprintPhaseHistory[];
  delivery: { status: "pending" | "delivered" | "failed" | "unknown"; threadUrl: string | null; lastError: string | null };
  allowedToDecide: boolean;
}
export type SprintHumanDecision = Exclude<SprintPhaseCommand, { action: "observe" }> & { eventId: string };
export interface SprintContextChange {
  expectedRevision: number; sourceFingerprint: string; reason: string;
  retrospective: string; nextSprintId: string | null;
}
const base = (team: string, sprintId: string): string =>
  `/api/teams/${encodeURIComponent(team)}/planning/sprints/${encodeURIComponent(sprintId)}/phase`;
export const sprintPhaseApi = {
  load: (team: string, sprintId: string, signal?: AbortSignal): Promise<SprintPhaseView> =>
    request(base(team, sprintId), { signal }),
  context: (team: string, sprintId: string, input: SprintContextChange): Promise<SprintPhaseView> =>
    request(`${base(team, sprintId)}/context`, { method: "PUT", body: JSON.stringify(input) }),
  decide: (team: string, sprintId: string, input: SprintHumanDecision): Promise<SprintPhaseView> =>
    request(`${base(team, sprintId)}/decisions`, { method: "POST", body: JSON.stringify(input) }),
};
