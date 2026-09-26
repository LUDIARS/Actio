// @spec スプリントフェーズの不変条件
import { initialSprintPhase, decideSprintPhase, type SprintPhaseDecision } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
import { one, exec, type Program, type GateDatabase } from "./query.js";
import { loadGate } from "./snapshot.js";
import { persist } from "./persistence.js";
export function* assertEffect(teamId: string, id: string, effect: SprintPhaseDecision["effect"], nextId: string | null): Program<void> {
    if (effect === "none")
        return;
    const active = yield* one<{
        id: string;
    }>("SELECT id FROM sprints WHERE team_id=? AND status='active' AND id<>?", teamId, id);
    if (active)
        throw new PlanningError("別の進行中スプリントがあります");
    if (effect === "start_next_sprint") {
        if (!nextId)
            throw new PlanningError("次計画を選択してください", 400);
        const next = yield* loadGate(teamId, nextId);
        if (next.state.held || next.state.phase !== "planning" || next.snapshot.sprint.status !== "planning")
            throw new PlanningError("次スプリントは保留されていない計画中のものを選んでください");
    }
}
export function* applyEffect(teamId: string, id: string, actor: string, effect: SprintPhaseDecision["effect"], nextId: string | null, now: Date, db: GateDatabase): Program<void> {
    if (effect === "none")
        return;
    const active = yield* one<{
        id: string;
    }>("SELECT id FROM sprints WHERE team_id=? AND status='active' AND id<>?", teamId, id);
    if (active)
        throw new PlanningError("別の進行中スプリントがあります");
    if (effect === "start_sprint") {
        yield* exec("UPDATE sprints SET status='active',approved_by=?,approved_at=?,revision=revision+1,updated_at=? WHERE team_id=? AND id=? AND status='planning'", actor, db.timestamp(now), db.timestamp(now), teamId, id);
        return;
    }
    if (!nextId)
        throw new PlanningError("次計画を選択してください", 400);
    const next = yield* loadGate(teamId, nextId);
    if (next.state.held || next.state.phase !== "planning" || next.snapshot.sprint.status !== "planning")
        throw new PlanningError("次スプリントは保留されていない計画中のものを選んでください");
    // Current completion and next scope are locked and checked by Tp in this same transaction.
    yield* exec("UPDATE sprints SET status='closed',revision=revision+1,updated_at=? WHERE team_id=? AND id=?", db.timestamp(now), teamId, id);
    yield* exec("UPDATE sprints SET status='active',approved_by=?,approved_at=?,revision=revision+1,updated_at=? WHERE team_id=? AND id=? AND status='planning'", actor, db.timestamp(now), db.timestamp(now), teamId, nextId);
    const after = yield* loadGate(teamId, nextId);
    const state = initialSprintPhase(nextId, "implementation");
    state.revision = next.row.revision;
    const observed = decideSprintPhase({ state, snapshot: after.snapshot, command: { action: "observe" }, now });
    yield* persist(next.row, observed.state, after.snapshot, "approved_next_start", actor, "前スプリントの次計画として人間が承認しました", now);
}
