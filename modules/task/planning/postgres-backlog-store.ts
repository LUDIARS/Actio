import { createHash, randomUUID } from "node:crypto";
import type { PlanningPostgres } from "../../../src/db/planning-postgres.js";
import { PlanningError, type BacklogTask } from "./contracts.js";
/** Task IDs and full contents survive grouping; this ports Memoria's snapshot guard. */
export class PostgresBacklogStore {
    constructor(private readonly db: PlanningPostgres) { }
    async list(teamId: string): Promise<BacklogTask[]> {
        const rows = (await this.db.prepare(`SELECT t.id, t.title, t.description, t.requirements, t.status, t.priority,
      t.assignee_id AS assigneeId, t.project_id AS projectId, t.deadline, t.estimated_minutes AS estimatedMinutes,
      t.sprint_id AS sprintId, t.category, p.group_id AS groupId, COALESCE(p.position, 0) AS position,
      t.executor_type AS executorType, t.ai_executor AS aiExecutor, t.is_critical_path AS isCriticalPath,
      t.slack_days AS slackDays, t.critical_path_error AS criticalPathError, t.blocked_by AS blockedBy,
      t.duration_days AS durationDays,
      t.updated_at AS updatedAt FROM tasks t LEFT JOIN backlog_placements p ON p.task_id = t.id
      WHERE t.team_id = ? AND t.lane = 'backlog' ORDER BY position, t.created_at, t.id`).all(teamId)) as Omit<BacklogTask, "fingerprint">[];
        return rows.map(row => ({ ...row, fingerprint: createHash("sha256").update(JSON.stringify(row)).digest("hex") }));
    }
    async groups(teamId: string): Promise<{
        id: string;
        name: string;
        reason: string;
    }[]> {
        return (await this.db.prepare("SELECT id, name, reason FROM backlog_groups WHERE team_id = ? ORDER BY created_at, id").all(teamId)) as {
            id: string;
            name: string;
            reason: string;
        }[];
    }
    async group(teamId: string, actor: string, input: {
        name: string;
        reason: string;
        tasks: {
            id: string;
            fingerprint: string;
        }[];
    }, now: Date): Promise<string> {
        return await this.db.transaction(async () => {
            const current = new Map((await this.list(teamId)).map(t => [t.id, t]));
            const selected = input.tasks.map(snapshot => {
                const task = current.get(snapshot.id);
                if (!task || task.fingerprint !== snapshot.fingerprint)
                    throw new PlanningError("対象タスクが変更されています。再読み込みしてください");
                return task;
            });
            if (new Set(selected.map(t => t.projectId)).size !== 1)
                throw new PlanningError("同じプロジェクトのタスクを選んでください", 400);
            const id = randomUUID();
            (await this.db.prepare("INSERT INTO backlog_groups VALUES (?, ?, ?, ?, ?, ?)").run(id, teamId, input.name, input.reason, actor, this.db.timestamp(now)));
            const place = this.db.prepare(`INSERT INTO backlog_placements(task_id, group_id) VALUES (?, ?)
        ON CONFLICT(task_id) DO UPDATE SET group_id = excluded.group_id`);
            for (const task of selected)
                (await place.run(task.id, id));
            return id;
        }, teamId);
    }
    async ungroup(teamId: string, id: string): Promise<void> {
        await this.db.transaction(async () => {
            const group = (await this.db.prepare("SELECT id FROM backlog_groups WHERE id = ? AND team_id = ?").get(id, teamId));
            if (!group)
                throw new PlanningError("グループが見つかりません", 404);
            (await this.db.prepare("UPDATE backlog_placements SET group_id = NULL WHERE group_id = ?").run(id));
            (await this.db.prepare("DELETE FROM backlog_groups WHERE id = ? AND team_id = ?").run(id, teamId));
        }, teamId);
    }
    async reorder(teamId: string, ids: string[]): Promise<void> {
        await this.db.transaction(async () => {
            const current = (await this.list(teamId));
            if (current.length !== ids.length || current.some(t => !ids.includes(t.id)))
                throw new PlanningError("バックログが変更されています。再読み込みしてください");
            const update = this.db.prepare(`INSERT INTO backlog_placements(task_id, position) VALUES (?, ?)
        ON CONFLICT(task_id) DO UPDATE SET position = excluded.position`);
            for (const [index, id] of ids.entries()) await update.run(id, index);
        }, teamId);
    }
}
