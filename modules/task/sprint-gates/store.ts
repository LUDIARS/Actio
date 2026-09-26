// @spec スプリントフェーズの永続化と復旧
import { createHash } from "node:crypto";
import { decideSprintPhase, sprintPhaseFingerprint, SprintPhaseError, type SprintPhaseDecision, type SprintPhaseState, type SprintPhaseSnapshot } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
import { all, one, exec, type GateDatabase, type Program } from "./query.js";
import { loadGate } from "./snapshot.js";
import { persist } from "./persistence.js";
import { applyEffect, assertEffect } from "./effects.js";
import type { GateRow, GateView, GateHistory, OutboxRow, HumanDecision, ContextChange, DecisionOutcome, StoredEvent, Delivery } from "./contracts.js";
export class SprintGateStore {
    constructor(private readonly db: GateDatabase) { }
    async view(teamId: string, id: string, now: Date): Promise<GateView> { return this.db.transaction(teamId, () => this.read(teamId, id, now)); }
    private *read(teamId: string, id: string, now: Date): Program<GateView> {
        let loaded = yield* loadGate(teamId, id);
        if (loaded.snapshot.sprint.status !== "closed") {
            const decision = decideSprintPhase({ ...loaded, command: { action: "observe" }, now });
            if (decision.changed) {
                yield* persist(loaded.row, decision.state, loaded.snapshot, "observe", null, decision.reason, now);
                loaded = yield* loadGate(teamId, id);
            }
        }
        const history = yield* all<GateHistory>("SELECT event_id AS eventId,action,actor_id AS actorId,reason,phase,revision,created_at AS createdAt FROM sprint_gate_history WHERE team_id=? AND sprint_id=? ORDER BY revision DESC", teamId, id);
        const delivery = yield* one<Delivery>("SELECT status,thread_url AS threadUrl,last_error AS lastError FROM sprint_gate_outbox WHERE team_id=? AND sprint_id=?", teamId, id);
        return { ...loaded.snapshot, state: loaded.state, nextSprintId: loaded.row.nextSprintId, history, delivery: delivery ?? { status: "pending", threadUrl: null, lastError: null } };
    }
    async context(teamId: string, id: string, actor: string, input: ContextChange, now: Date, requireLeader = false): Promise<GateView> {
        return this.db.transaction(teamId, function* () {
            if (requireLeader) {
                const member = yield* one<{
                    role: string;
                }>("SELECT role FROM team_members WHERE team_id=? AND user_id=?", teamId, actor);
                if (member?.role !== "leader")
                    throw new PlanningError("このチームのリーダー権限がありません", 400);
            }
            const current = yield* loadGate(teamId, id);
            if (current.snapshot.sprint.status === "closed")
                throw new PlanningError("終了したスプリントは変更できません");
            if (current.state.revision !== input.expectedRevision || current.state.sourceFingerprint !== input.sourceFingerprint || sprintPhaseFingerprint(current.snapshot) !== input.sourceFingerprint)
                throw new PlanningError("対象が変更されています。再読み込みしてください");
            let nextPlan = current.snapshot.nextPlan;
            if (input.nextSprintId) {
                if (input.nextSprintId === id)
                    throw new PlanningError("別の次スプリントを選んでください", 400);
                const next = yield* loadGate(teamId, input.nextSprintId);
                if (next.snapshot.sprint.status !== "planning")
                    throw new PlanningError("計画中の次スプリントを選んでください", 400);
                nextPlan = { sprint: next.snapshot.sprint, tasks: next.snapshot.tasks, complete: true };
            }
            else
                nextPlan = null;
            const snapshot = { ...current.snapshot, retrospective: input.retrospective, nextPlan };
            const decision = decideSprintPhase({ state: current.state, snapshot, command: { action: "observe" }, now });
            if (decision.changed)
                yield* persist(current.row, decision.state, snapshot, "context", actor, input.reason, now);
        }).then(() => this.view(teamId, id, now));
    }
    async decide(teamId: string, id: string, actor: string, input: HumanDecision, now: Date, requireLeader = false): Promise<DecisionOutcome> {
        const requestHash = createHash("sha256").update(JSON.stringify({ teamId, id, actor, input })).digest("hex");
        const db = this.db;
        return db.transaction(teamId, function* () {
            const old = yield* one<StoredEvent>("SELECT event_id AS eventId,request_hash AS requestHash,outcome,reason FROM sprint_gate_events WHERE event_id=?", input.eventId);
            if (old) {
                if (old.requestHash !== requestHash)
                    throw new PlanningError("同じ回答IDが別の内容で使われています");
                return { outcome: old.outcome, reason: old.reason };
            }
            let outcome: DecisionOutcome = { outcome: "rejected", reason: "判断を検証できません" };
            let prepared: {
                loaded: {
                    row: GateRow;
                    state: SprintPhaseState;
                    snapshot: SprintPhaseSnapshot;
                };
                decision: SprintPhaseDecision;
            } | undefined;
            try {
                if (requireLeader) {
                    const member = yield* one<{
                        role: string;
                    }>("SELECT role FROM team_members WHERE team_id=? AND user_id=?", teamId, actor);
                    if (member?.role !== "leader")
                        throw new PlanningError("このチームのリーダー権限がありません", 400);
                }
                const loaded = yield* loadGate(teamId, id);
                if (loaded.snapshot.sprint.status === "closed")
                    throw new PlanningError("このスプリントはすでに終了しています");
                const { eventId: _event, ...command } = input;
                const decision = decideSprintPhase({ ...loaded, command, now });
                yield* assertEffect(teamId, id, decision.effect, loaded.row.nextSprintId);
                prepared = { loaded, decision };
            }
            catch (error) {
                if (!(error instanceof PlanningError) && !(error instanceof SprintPhaseError))
                    throw error;
                outcome = { outcome: "rejected", reason: error.message };
            }
            if (prepared) {
                // Every failure after the first business write propagates and rolls back the entire transaction.
                const { loaded, decision } = prepared;
                yield* applyEffect(teamId, id, actor, decision.effect, loaded.row.nextSprintId, now, db);
                const after = yield* loadGate(teamId, id);
                yield* persist(loaded.row, decision.state, after.snapshot, input.action, actor, input.reason, now, input.eventId);
                outcome = { outcome: "applied", reason: "人間の判断を反映しました" };
            }
            yield* exec("INSERT INTO sprint_gate_events(event_id,team_id,sprint_id,request_hash,outcome,reason,created_at) VALUES(?,?,?,?,?,?,?)", input.eventId, teamId, id, requestHash, outcome.outcome, outcome.reason, now.toISOString());
            return outcome;
        });
    }
    async candidates(): Promise<{
        teamId: string;
        id: string;
    }[]> {
        return this.db.transaction("scan", function* () {
            return yield* all<{
                teamId: string;
                id: string;
            }>("SELECT team_id AS teamId,id FROM sprints WHERE status <> 'closed' ORDER BY team_id,id");
        }, { lockTasks: false });
    }
    async pending(): Promise<OutboxRow[]> { return this.db.transaction("outbox", function* () { return yield* all<OutboxRow>("SELECT team_id AS teamId,sprint_id AS sprintId,revision,payload_json AS payloadJson,status,thread_url AS threadUrl,last_error AS lastError FROM sprint_gate_outbox ORDER BY team_id,sprint_id"); }, { lockTasks: false }); }
    async delivery(row: OutboxRow, value: Delivery): Promise<void> { return this.db.transaction(row.teamId, function* () { yield* exec("UPDATE sprint_gate_outbox SET status=?,thread_url=?,last_error=? WHERE team_id=? AND sprint_id=? AND revision=?", value.status, value.threadUrl, value.lastError, row.teamId, row.sprintId, row.revision); }, { lockTasks: false }); }
    async eventOutcome(eventId: string): Promise<DecisionOutcome | undefined> { return this.db.transaction("events", function* () { return yield* one<DecisionOutcome>("SELECT outcome,reason FROM sprint_gate_events WHERE event_id=?", eventId); }, { lockTasks: false }); }
    async rejectExternal(teamId: string, id: string, eventId: string, reason: string, now: Date): Promise<DecisionOutcome> {
        return this.db.transaction(teamId, function* () {
            yield* exec("INSERT INTO sprint_gate_events(event_id,team_id,sprint_id,request_hash,outcome,reason,created_at) VALUES(?,?,?,'identity-unavailable','rejected',?,?) ON CONFLICT(event_id) DO NOTHING", eventId, teamId, id, reason, now.toISOString());
            const value = yield* one<DecisionOutcome>("SELECT outcome,reason FROM sprint_gate_events WHERE event_id=?", eventId);
            if (!value)
                throw new Error("Decision outcome was not stored");
            return value;
        }, { lockTasks: false });
    }
}
