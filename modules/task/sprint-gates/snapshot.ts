// @spec スプリントフェーズの不変条件
import { createHash } from "node:crypto";
import { initialSprintPhase, sprintPhaseState, type SprintPhaseState, type SprintPhaseSnapshot, type Sprint, type BacklogTask } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
import { one, all, exec, type Program } from "./query.js";
import type { GateRow, GateTask, GateSnapshot } from "./contracts.js";
const sprintFields = "id, team_id AS teamId, name, goal, starts_on AS startsOn, ends_on AS endsOn, original_ends_on AS originalEndsOn, cadence_days AS cadenceDays, buffer_ends_on AS bufferEndsOn, status, capacity_minutes AS capacityMinutes, revision";
export function* loadSprint(teamId: string, id: string): Program<Sprint> {
    const row = yield* one<Sprint>(`SELECT ${sprintFields} FROM sprints WHERE team_id = ? AND id = ?`, teamId, id);
    if (!row)
        throw new PlanningError("スプリントが見つかりません", 404);
    return row;
}
export function* loadTasks(teamId: string, id: string): Program<GateTask[]> {
    // Deliberately no project/lane/status filter: every attached task belongs to the evidence.
    const rows = yield* all<Omit<BacklogTask, "fingerprint"> & {
        teamId: string;
        completionEvidence: unknown;
    }>(`SELECT t.id,t.team_id AS teamId,t.title,t.description,t.requirements,t.status,t.priority,t.assignee_id AS assigneeId,t.project_id AS projectId,t.deadline,t.estimated_minutes AS estimatedMinutes,t.sprint_id AS sprintId,t.category,NULL AS groupId,0 AS position,t.updated_at AS updatedAt,t.completion_evidence AS completionEvidence FROM tasks t WHERE t.sprint_id = ? ORDER BY t.id`, id);
    if (rows.some(t => t.teamId !== teamId))
        throw new PlanningError("スプリントの所属とタスクのチームが一致しません");
    return rows.map(({ teamId: _team, completionEvidence, ...task }) => {
        const evidence = completionEvidence == null ? null : typeof completionEvidence === "string" ? completionEvidence : JSON.stringify(completionEvidence);
        return { ...task, completionEvidence: evidence, fingerprint: createHash("sha256").update(JSON.stringify({ ...task, completionEvidence: evidence })).digest("hex") };
    });
}
export function* loadGate(teamId: string, id: string): Program<{
    row: GateRow;
    state: SprintPhaseState;
    snapshot: GateSnapshot;
}> {
    const sprint = yield* loadSprint(teamId, id);
    let row = yield* one<GateRow>("SELECT team_id AS teamId,sprint_id AS sprintId,revision,state_json AS stateJson,retrospective,next_sprint_id AS nextSprintId FROM sprint_gates WHERE team_id = ? AND sprint_id = ?", teamId, id);
    if (!row) {
        if (sprint.status === "closed")
            throw new PlanningError("この終了済みスプリントにはフェーズ記録がありません");
        const state = initialSprintPhase(id, sprint.status === "active" ? "implementation" : "planning");
        row = { teamId, sprintId: id, revision: 0, stateJson: JSON.stringify(state), retrospective: "", nextSprintId: null };
        yield* exec("INSERT INTO sprint_gates(team_id,sprint_id,revision,state_json,retrospective,next_sprint_id) VALUES(?,?,0,?,'',NULL)", teamId, id, row.stateJson);
    }
    const tasks = yield* loadTasks(teamId, id);
    const nextPlan = row.nextSprintId ? { sprint: yield* loadSprint(teamId, row.nextSprintId), tasks: yield* loadTasks(teamId, row.nextSprintId), complete: true } : null;
    return { row, state: sprintPhaseState.parse(JSON.parse(row.stateJson)), snapshot: { sprint, tasks, complete: true, retrospective: row.retrospective, nextPlan } };
}
