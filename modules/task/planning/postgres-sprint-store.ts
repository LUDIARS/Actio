import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { PlanningPostgres } from "../../../src/db/planning-postgres.js";
import { PlanningError, type Sprint, type newSprint, type sprintChange } from "./contracts.js";
const fields = `id, team_id AS teamId, name, goal, starts_on AS startsOn, ends_on AS endsOn,
  original_ends_on AS originalEndsOn, cadence_days AS cadenceDays, buffer_ends_on AS bufferEndsOn,
  status, capacity_minutes AS capacityMinutes, revision`;
export class PostgresSprintStore {
    constructor(private readonly db: PlanningPostgres) { }
    async list(teamId: string): Promise<Sprint[]> {
        return (await this.db.prepare(`SELECT ${fields} FROM sprints WHERE team_id = ? ORDER BY starts_on, id`).all(teamId)) as Sprint[];
    }
    async find(teamId: string, id: string): Promise<Sprint> {
        const sprint = (await this.db.prepare(`SELECT ${fields} FROM sprints WHERE team_id = ? AND id = ?`).get(teamId, id)) as Sprint | undefined;
        if (!sprint)
            throw new PlanningError("スプリントが見つかりません", 404);
        return sprint;
    }
    async history(teamId: string, id: string): Promise<unknown[]> {
        (await this.find(teamId, id));
        return (await this.db.prepare(`SELECT kind, actor_id AS actorId, reason, before_json AS beforeJson,
      after_json AS afterJson, created_at AS createdAt FROM sprint_changes WHERE sprint_id = ? ORDER BY created_at, event_order`).all(id));
    }
    async create(teamId: string, actor: string, input: z.infer<typeof newSprint>, now: Date): Promise<Sprint> {
        return await this.db.transaction(async () => {
            if (!(await this.db.prepare("SELECT id FROM team_refs WHERE id = ?").get(teamId)))
                throw new PlanningError("チームが見つかりません", 404);
            (await this.assertNoOverlap(teamId, "", input.startsOn, input.endsOn));
            const id = randomUUID();
            (await this.db.prepare(`INSERT INTO sprints(id, team_id, name, goal, starts_on, ends_on, original_ends_on,
        cadence_days, buffer_ends_on, status, capacity_minutes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?)`).run(id, teamId, input.name, input.goal, input.startsOn, input.endsOn, input.endsOn, input.cadenceDays, input.bufferEndsOn, input.capacityMinutes, actor, this.db.timestamp(now), this.db.timestamp(now)));
            const sprint = (await this.find(teamId, id));
            (await this.record(id, "create", actor, "初期計画", {}, sprint, now));
            return sprint;
        }, teamId);
    }
    async change(teamId: string, id: string, actor: string, input: z.infer<typeof sprintChange>, now: Date): Promise<Sprint> {
        return await this.db.transaction(async () => {
            const before = (await this.find(teamId, id));
            if (before.revision !== input.revision)
                throw new PlanningError("計画が変更されています。再読み込みしてください");
            if (before.status === "closed")
                throw new PlanningError("終了したスプリントは変更できません");
            if (input.action === "start") {
                if (before.status !== "planning")
                    throw new PlanningError("計画中のスプリントのみ開始できます");
                if ((await this.list(teamId)).some(s => s.status === "active"))
                    throw new PlanningError("進行中のスプリントを先に終了してください");
                (await this.db.prepare("UPDATE sprints SET status = 'active', approved_by = ?, approved_at = ? WHERE id = ?")
                    .run(actor, this.db.timestamp(now), id));
            }
            else if (input.action === "close") {
                // Completed tasks remain attached for history; unfinished tasks return to the product backlog.
                const carried = (await this.db.prepare("SELECT id FROM tasks WHERE sprint_id = ? AND status NOT IN ('done', 'cancelled')").all(id));
                (await this.db.prepare(`UPDATE tasks SET sprint_id = NULL, carried_from_sprint_id = ?, updated_at = ?
          WHERE sprint_id = ? AND status NOT IN ('done', 'cancelled')`).run(id, this.db.timestamp(now), id));
                (await this.db.prepare("UPDATE sprints SET status = 'closed' WHERE id = ?").run(id));
                (await this.record(id, "carry_back", actor, input.reason, { tasks: carried }, {}, now));
            }
            else if (input.action === "extend") {
                if (input.endsOn <= before.endsOn)
                    throw new PlanningError("現在の締め切りより後の日付を指定してください", 400);
                if (input.endsOn > before.bufferEndsOn)
                    throw new PlanningError("バッファ上限を超えます。リスケで開始日・締め切り・バッファを見直してください");
                (await this.assertNoOverlap(teamId, id, before.startsOn, input.endsOn));
                (await this.db.prepare("UPDATE sprints SET ends_on = ? WHERE id = ?").run(input.endsOn, id));
            }
            else if (input.action === "reschedule") {
                if (input.startsOn > input.endsOn || input.endsOn > input.bufferEndsOn)
                    throw new PlanningError("開始日・締め切り・バッファ上限の順で指定してください", 400);
                if (before.status === "active" && input.startsOn !== before.startsOn)
                    throw new PlanningError("開始済みスプリントの開始日は変更できません", 400);
                (await this.assertNoOverlap(teamId, id, input.startsOn, input.endsOn));
                (await this.db.prepare("UPDATE sprints SET starts_on = ?, ends_on = ?, buffer_ends_on = ?, cadence_days = ?, capacity_minutes = ? WHERE id = ?")
                    .run(input.startsOn, input.endsOn, input.bufferEndsOn, input.cadenceDays, input.capacityMinutes, id));
            }
            else {
                (await this.assign(teamId, before, input, now));
            }
            (await this.db.prepare("UPDATE sprints SET revision = revision + 1, updated_at = ? WHERE id = ?").run(this.db.timestamp(now), id));
            const after = (await this.find(teamId, id));
            (await this.record(id, input.action, actor, input.reason, before, { sprint: after, input }, now));
            return after;
        }, teamId);
    }
    private async assign(teamId: string, sprint: Sprint, input: Extract<z.infer<typeof sprintChange>, {
        action: "assign" | "remove";
    }>, now: Date): Promise<void> {
        const task = (await this.db.prepare("SELECT team_id, lane, sprint_id, status, assignee_id FROM tasks WHERE id = ?").get(input.taskId)) as {
            team_id: string;
            lane: string;
            sprint_id: string | null;
            status: string;
            assignee_id: string | null;
        } | undefined;
        if (!task || task.team_id !== teamId || task.lane !== "backlog")
            throw new PlanningError("同じチームのバックログを選んでください", 400);
        if (input.action === "assign") {
            if (task.sprint_id)
                throw new PlanningError("割付済みのタスクです。先に現在のスプリントから戻してください");
            if (["done", "cancelled"].includes(task.status))
                throw new PlanningError("完了済みタスクは割り付けられません", 400);
            if (!task.assignee_id || !(await this.db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?").get(teamId, task.assignee_id)))
                throw new PlanningError("有効なチーム担当者を設定してください", 400);
        }
        else if (task.sprint_id !== sprint.id)
            throw new PlanningError("このスプリントに所属していません", 400);
        (await this.db.prepare("UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ?")
            .run(input.action === "assign" ? sprint.id : null, this.db.timestamp(now), input.taskId));
    }
    private async assertNoOverlap(teamId: string, id: string, start: string, end: string): Promise<void> {
        const conflict = (await this.list(teamId)).find(s => s.id !== id && s.status !== "closed" && s.startsOn <= end && s.endsOn >= start);
        if (conflict)
            throw new PlanningError(`「${conflict.name}」と期間が重なります。後続スプリントもリスケしてください`);
    }
    private async record(id: string, kind: string, actor: string, reason: string, before: unknown, after: unknown, now: Date): Promise<void> {
        (await this.db.prepare("INSERT INTO sprint_changes(id,sprint_id,kind,actor_id,reason,before_json,after_json,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .run(randomUUID(), id, kind, actor, reason, JSON.stringify(before), JSON.stringify(after), now.toISOString()));
    }
}
