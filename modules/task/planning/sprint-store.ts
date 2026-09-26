import { assertGoalEditable } from "../sprint-gates/legacy-guard.js";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { SqliteDatabase } from "../../../src/db/dialects/sqlite.js";
import { PlanningError, type Sprint, type newSprint, type sprintChange } from "./contracts.js";

const fields = `id, team_id AS teamId, name, goal, starts_on AS startsOn, ends_on AS endsOn,
  original_ends_on AS originalEndsOn, cadence_days AS cadenceDays, buffer_ends_on AS bufferEndsOn,
  status, capacity_minutes AS capacityMinutes, revision`;

export class SprintStore {
  constructor(private readonly db: SqliteDatabase) {}

  list(teamId: string): Sprint[] {
    return this.db.prepare(`SELECT ${fields} FROM sprints WHERE team_id = ? ORDER BY starts_on, id`).all(teamId) as Sprint[];
  }

  find(teamId: string, id: string): Sprint {
    const sprint = this.db.prepare(`SELECT ${fields} FROM sprints WHERE team_id = ? AND id = ?`).get(teamId, id) as Sprint | undefined;
    if (!sprint) throw new PlanningError("スプリントが見つかりません", 404);
    return sprint;
  }

  history(teamId: string, id: string): unknown[] {
    this.find(teamId, id);
    return this.db.prepare(`SELECT kind, actor_id AS actorId, reason, before_json AS beforeJson,
      after_json AS afterJson, created_at AS createdAt FROM sprint_changes WHERE sprint_id = ? ORDER BY created_at, rowid`).all(id);
  }

  create(teamId: string, actor: string, input: z.infer<typeof newSprint>, now: Date): Sprint {
    return this.db.transaction(() => {
      if (!this.db.prepare("SELECT id FROM team_refs WHERE id = ?").get(teamId)) throw new PlanningError("チームが見つかりません", 404);
      this.assertNoOverlap(teamId, "", input.startsOn, input.endsOn);
      const id = randomUUID();
      this.db.prepare(`INSERT INTO sprints(id, team_id, name, goal, starts_on, ends_on, original_ends_on,
        cadence_days, buffer_ends_on, status, capacity_minutes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?)`).run(id, teamId, input.name, input.goal,
        input.startsOn, input.endsOn, input.endsOn, input.cadenceDays, input.bufferEndsOn, input.capacityMinutes,
        actor, Math.floor(now.getTime() / 1000), Math.floor(now.getTime() / 1000));
      const sprint = this.find(teamId, id);
      this.record(id, "create", actor, "初期計画", {}, sprint, now);
      return sprint;
    })();
  }

  change(teamId: string, id: string, actor: string, input: z.infer<typeof sprintChange>, now: Date): Sprint {
    return this.db.transaction(() => {
      const before = this.find(teamId, id);
      if (before.revision !== input.revision) throw new PlanningError("計画が変更されています。再読み込みしてください");
      if (before.status === "closed") throw new PlanningError("終了したスプリントは変更できません");
      if (input.action === "start" || input.action === "close") throw new PlanningError("フェーズ画面で計画・受入・振り返り・次計画を確認してください。直接の開始・終了はできません");
      if (input.action === "update_goal") {
        const gate = (this.db.prepare("SELECT state_json AS stateJson FROM sprint_gates WHERE team_id=? AND sprint_id=?").get(teamId,id)) as {stateJson:string}|undefined;
        assertGoalEditable(before.status,gate?.stateJson);
        this.db.prepare("UPDATE sprints SET goal=? WHERE id=?").run(input.goal,id);
      } else if (input.action === "extend") {
        if (input.endsOn <= before.endsOn) throw new PlanningError("現在の締め切りより後の日付を指定してください", 400);
        if (input.endsOn > before.bufferEndsOn) throw new PlanningError("バッファ上限を超えます。リスケで開始日・締め切り・バッファを見直してください");
        this.assertNoOverlap(teamId, id, before.startsOn, input.endsOn);
        this.db.prepare("UPDATE sprints SET ends_on = ? WHERE id = ?").run(input.endsOn, id);
      } else if (input.action === "reschedule") {
        if (input.startsOn > input.endsOn || input.endsOn > input.bufferEndsOn) throw new PlanningError("開始日・締め切り・バッファ上限の順で指定してください", 400);
        if (before.status === "active" && input.startsOn !== before.startsOn) throw new PlanningError("開始済みスプリントの開始日は変更できません", 400);
        this.assertNoOverlap(teamId, id, input.startsOn, input.endsOn);
        this.db.prepare("UPDATE sprints SET starts_on = ?, ends_on = ?, buffer_ends_on = ?, cadence_days = ?, capacity_minutes = ? WHERE id = ?")
          .run(input.startsOn, input.endsOn, input.bufferEndsOn, input.cadenceDays, input.capacityMinutes, id);
      } else {
        this.assign(teamId, before, input, now);
      }
      this.db.prepare("UPDATE sprints SET revision = revision + 1, updated_at = ? WHERE id = ?").run(Math.floor(now.getTime() / 1000), id);
      const after = this.find(teamId, id);
      this.record(id, input.action, actor, input.reason, before, { sprint: after, input }, now);
      return after;
    })();
  }

  private assign(teamId: string, sprint: Sprint, input: Extract<z.infer<typeof sprintChange>, { action: "assign" | "remove" }>, now: Date): void {
    const task = this.db.prepare("SELECT team_id, lane, sprint_id, status, assignee_id FROM tasks WHERE id = ?").get(input.taskId) as
      { team_id: string; lane: string; sprint_id: string | null; status: string; assignee_id: string | null } | undefined;
    if (!task || task.team_id !== teamId || task.lane !== "backlog") throw new PlanningError("同じチームのバックログを選んでください", 400);
    if (input.action === "assign") {
      if (task.sprint_id) throw new PlanningError("割付済みのタスクです。先に現在のスプリントから戻してください");
      if (["done", "cancelled"].includes(task.status)) throw new PlanningError("完了済みタスクは割り付けられません", 400);
      if (!task.assignee_id || !this.db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?").get(teamId, task.assignee_id)) throw new PlanningError("有効なチーム担当者を設定してください", 400);
    } else if (task.sprint_id !== sprint.id) throw new PlanningError("このスプリントに所属していません", 400);
    this.db.prepare("UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ?")
      .run(input.action === "assign" ? sprint.id : null, Math.floor(now.getTime() / 1000), input.taskId);
  }

  private assertNoOverlap(teamId: string, id: string, start: string, end: string): void {
    const conflict = this.list(teamId).find(s => s.id !== id && s.status !== "closed" && s.startsOn <= end && s.endsOn >= start);
    if (conflict) throw new PlanningError(`「${conflict.name}」と期間が重なります。後続スプリントもリスケしてください`);
  }

  private record(id: string, kind: string, actor: string, reason: string, before: unknown, after: unknown, now: Date): void {
    this.db.prepare("INSERT INTO sprint_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), id, kind, actor, reason, JSON.stringify(before), JSON.stringify(after), now.toISOString());
  }
}
