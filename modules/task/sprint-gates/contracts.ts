// @spec スプリントフェーズのAPIと画面契約
import { z } from "zod";
import type { SprintPhaseState, SprintPhaseSnapshot, SprintPhaseCommand } from "@ludiars/terpsichore";
const identity = z.string().trim().min(1).max(200);
const revision = { expectedRevision: z.number().int().nonnegative(), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(1).max(4000) };
export const gateContext = z.object({ ...revision, retrospective: z.string().max(20000), nextSprintId: identity.nullable() }).strict();
export const gateDecision = z.object({ ...revision, eventId: identity, action: z.enum(["approve", "reject", "hold", "resume", "resubmit"]), taskIds: z.array(identity).max(5000).optional() }).strict();
export type HumanDecision = z.infer<typeof gateDecision>;
export type ContextChange = z.infer<typeof gateContext>;
export interface GateRow {
    teamId: string;
    sprintId: string;
    revision: number;
    stateJson: string;
    retrospective: string;
    nextSprintId: string | null;
}
export interface Delivery {
    status: "pending" | "delivered" | "failed" | "unknown";
    threadUrl: string | null;
    lastError: string | null;
}
export interface GateHistory {
    eventId: string;
    action: string;
    actorId: string | null;
    reason: string;
    phase: string;
    revision: number;
    createdAt: string;
}
export type GateTask = SprintPhaseSnapshot["tasks"][number] & {
    completionEvidence: string | null;
};
export interface GateSnapshot extends SprintPhaseSnapshot {
    tasks: GateTask[];
    nextPlan: {
        sprint: SprintPhaseSnapshot["sprint"];
        tasks: GateTask[];
        complete: boolean;
    } | null;
}
export interface GateView extends GateSnapshot {
    state: SprintPhaseState;
    nextSprintId: string | null;
    history: GateHistory[];
    delivery: Delivery;
    allowedToDecide?: boolean;
}
export interface Projection {
    version: 1;
    dialogueKey: string;
    teamId: string;
    sprintId: string;
    sprintName: string;
    phase: SprintPhaseState["phase"];
    revision: number;
    sourceFingerprint: string;
    held: boolean;
    closed: boolean;
    reason: string;
    summary: string;
    taskIds: string[];
    actioPath: string;
}
export interface OutboxRow {
    teamId: string;
    sprintId: string;
    revision: number;
    payloadJson: string;
    status: Delivery["status"];
    threadUrl: string | null;
    lastError: string | null;
}
export interface DecisionOutcome {
    outcome: "applied" | "rejected";
    reason: string;
}
export interface StoredEvent extends DecisionOutcome {
    eventId: string;
    requestHash: string;
}
export interface CcEvent {
    eventId: string;
    dialogueKey: string;
    teamId: string;
    sprintId: string;
    revision: number;
    sourceFingerprint: string;
    action: Exclude<SprintPhaseCommand, {
        action: "observe";
    }>["action"];
    reason: string;
    taskIds: string[];
    actor: {
        discordUserId: string;
        discordGuildId: string;
    };
    occurredAt: string;
}
