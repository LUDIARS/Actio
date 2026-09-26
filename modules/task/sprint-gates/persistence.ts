// @spec スプリントフェーズの永続化と復旧
import { randomUUID } from "node:crypto";
import { sprintPhaseFingerprint, type SprintPhaseState, type SprintPhaseSnapshot } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
import { one, exec, type Program } from "./query.js";
import type { GateRow, Projection } from "./contracts.js";
export function projection(teamId: string, state: SprintPhaseState, snapshot: SprintPhaseSnapshot, reason: string): Projection {
    const current = snapshot.sprint;
    const next = snapshot.nextPlan;
    return { version: 1, dialogueKey: dialogueKey(teamId, current.id), teamId, sprintId: current.id, sprintName: current.name, phase: state.phase, revision: state.revision, sourceFingerprint: state.sourceFingerprint, held: state.held, closed: current.status === "closed", reason,
        summary: boundedSummary([current.goal ?? "", `期間: ${current.startsOn} ～ ${current.endsOn} / 容量: ${current.capacityMinutes ?? "未設定"} 分`, ...snapshot.tasks.map(t => `[${t.status}] ${t.id}: ${t.title}`), `振り返り: ${snapshot.retrospective || "未記入"}`, next ? `次計画: ${next.sprint.name} / ${next.sprint.goal ?? "未設定"} / ${next.sprint.startsOn} ～ ${next.sprint.endsOn} / ${next.sprint.capacityMinutes ?? "未設定"} 分 / ${next.tasks.map(t => t.id + ": " + t.title).join("; ")}` : "次計画: 未選択"].join("\n")), taskIds: snapshot.tasks.map(t => t.id), actioPath: `/tasks/planning?teamId=${encodeURIComponent(teamId)}&sprintId=${encodeURIComponent(current.id)}` };
}
export function dialogueKey(teamId: string, sprintId: string): string { return `actio:${teamId}:${sprintId}`; }
export function* persist(row: GateRow, state: SprintPhaseState, snapshot: SprintPhaseSnapshot, action: string, actor: string | null, reason: string, now: Date, eventId: string = randomUUID()): Program<void> {
    state = { ...state, sourceFingerprint: sprintPhaseFingerprint(snapshot) };
    const updated = yield* one<{
        revision: number;
    }>("UPDATE sprint_gates SET revision=?,state_json=?,retrospective=?,next_sprint_id=? WHERE team_id=? AND sprint_id=? AND revision=? RETURNING revision", state.revision, JSON.stringify(state), snapshot.retrospective, snapshot.nextPlan?.sprint.id ?? null, row.teamId, row.sprintId, row.revision);
    if (!updated)
        throw new PlanningError("別の判断が先に反映されました。最新の状態を確認してください");
    yield* exec("INSERT INTO sprint_gate_history(event_id,team_id,sprint_id,action,actor_id,reason,phase,revision,created_at,state_json,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)", eventId, row.teamId, row.sprintId, action, actor, reason, state.phase, state.revision, now.toISOString(), JSON.stringify(state), JSON.stringify(snapshot));
    const payload = JSON.stringify(projection(row.teamId, state, snapshot, reason));
    yield* exec(`INSERT INTO sprint_gate_outbox(team_id,sprint_id,revision,payload_json,status,thread_url,last_error) VALUES(?,?,?,?,'pending',NULL,NULL)
 ON CONFLICT(team_id,sprint_id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json,status='pending',last_error=NULL`, row.teamId, row.sprintId, state.revision, payload);
}
/** Preserve surrogate pairs while making the partial evidence explicit to humans. */
function boundedSummary(value: string): string {
    if (value.length <= 24000)
        return value;
    const suffix = "\n（要約を省略しています。全対象・根拠は Actio で確認してください）";
    let preview = value.slice(0, 24000 - suffix.length);
    if (/[\uD800-\uDBFF]$/.test(preview))
        preview = preview.slice(0, -1);
    return preview + suffix;
}
