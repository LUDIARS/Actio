import { createHash, randomUUID } from "node:crypto";
import type { PlanningPostgres } from "../../../src/db/planning-postgres.js";
import { PlanningError } from "./contracts.js";
import type { ReviewedSpec } from "./praeforma-client.js";
export class PostgresSpecImportStore {
    constructor(private readonly db: PlanningPostgres) { }
    async existing(teamId: string, projectId: string, specId: string): Promise<{
        id: string;
        fingerprint: string;
        requirements: string | null;
        estimatedMinutes: number | null;
    } | null> {
        const row = (await this.db.prepare("SELECT * FROM tasks WHERE source = 'praeforma-review' AND source_ref = ?")
            .get(`${teamId}:${projectId}:${specId}`)) as Record<string, unknown> | undefined;
        if (!row)
            return null;
        return { id: String(row.id), fingerprint: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
            requirements: row.requirements as string | null, estimatedMinutes: row.estimated_minutes as number | null };
    }
    async import(teamId: string, actor: string, detail: ReviewedSpec, input: {
        fingerprint: string;
        existingFingerprint?: string | null;
        assigneeId: string;
        deadline: string;
        estimatedMinutes: number;
        reviewNote: string;
    }, now: Date): Promise<{
        id: string;
        created: boolean;
    }> {
        return await this.db.transaction(async () => {
            if (detail.fingerprint !== input.fingerprint)
                throw new PlanningError("確認後に Pf 仕様が変更されています。再精査してください");
            if (detail.spec.status === "obsolete")
                throw new PlanningError("廃止された仕様は登録できません", 400);
            if (!(await this.db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?").get(teamId, input.assigneeId)))
                throw new PlanningError("チームの担当者を指定してください", 400);
            const reference = `${teamId}:${detail.spec.projectId}:${detail.spec.id}`;
            const existing = (await this.existing(teamId, detail.spec.projectId, detail.spec.id));
            if (existing && !input.existingFingerprint)
                return { id: existing.id, created: false };
            if (input.existingFingerprint && existing?.fingerprint !== input.existingFingerprint)
                throw new PlanningError("精査後に登録済みタスクが変更されています。再読み込みしてください");
            const requirements = [
                `Pf ${detail.spec.code} / version ${detail.spec.version} / ${detail.spec.status}`,
                `精査: ${input.reviewNote}`, ...detail.acceptance.filter(a => a.enabled).map(a => `- ${a.text}`),
                ...(detail.spec.preconditions ?? []).map(t => `前提: ${t}`),
                ...(detail.spec.postconditions ?? []).map(t => `事後条件: ${t}`),
            ].join("\n");
            const id = existing?.id ?? randomUUID();
            const timestamp = this.db.timestamp(now);
            const provenance = { praeforma: { projectId: detail.spec.projectId, specId: detail.spec.id, version: detail.spec.version,
                    fingerprint: detail.fingerprint, reviewedBy: actor, reviewedAt: now.toISOString(), reviewNote: input.reviewNote } };
            if (existing) {
                const before = (await this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id)) as Record<string, unknown>;
                if (["done", "cancelled"].includes(String(before.status)))
                    throw new PlanningError("完了済みタスクの仕様は上書きできません。追加分を別のバックログとして登録してください");
                (await this.db.prepare(`UPDATE tasks SET title = ?, description = ?, requirements = ?, assignee_id = ?,
          deadline = ?, estimated_minutes = ?, plugin_payload = CAST(? AS TEXT)::jsonb, updated_at = ? WHERE id = ?`)
                    .run(detail.spec.title, detail.spec.description, requirements, input.assigneeId, this.db.timestamp(new Date(input.deadline)), input.estimatedMinutes, JSON.stringify(provenance), timestamp, id));
                if (before.sprint_id) {
                    const after = (await this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
                    (await this.db.prepare("UPDATE sprints SET revision = revision + 1, updated_at = ? WHERE id = ?").run(timestamp, before.sprint_id));
                    (await this.db.prepare("INSERT INTO sprint_changes(id,sprint_id,kind,actor_id,reason,before_json,after_json,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), before.sprint_id, "spec_review", actor, input.reviewNote, JSON.stringify(before), JSON.stringify(after), now.toISOString()));
                }
                (await this.record(id, actor, input.reviewNote, before, detail, now));
                return { id, created: false };
            }
            (await this.db.prepare(`INSERT INTO tasks(id, owner_id, assignee_id, project_id, team_id, lane,
        title, description, requirements, status, priority, deadline, estimated_minutes, source, source_ref,
        creator_type, kind, created_at, updated_at, plugin_payload)
        VALUES (?, ?, ?, ?, ?, 'backlog', ?, ?, ?, 'open', ?, ?, ?, 'praeforma-review', ?, 'human', 'task', ?, ?, CAST(? AS TEXT)::jsonb)`)
                .run(id, actor, input.assigneeId, `pf:${detail.spec.projectId}`, teamId, detail.spec.title, detail.spec.description, requirements, detail.spec.priority === "must" ? "high" : "medium", this.db.timestamp(new Date(input.deadline)), input.estimatedMinutes, reference, timestamp, timestamp, JSON.stringify(provenance)));
            (await this.record(id, actor, input.reviewNote, null, detail, now));
            return { id, created: true };
        }, teamId);
    }
    private async record(id: string, actor: string, reason: string, before: unknown, detail: ReviewedSpec, now: Date): Promise<void> {
        const after = (await this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
        (await this.db.prepare("INSERT INTO task_spec_reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .run(randomUUID(), id, actor, reason, JSON.stringify(before), JSON.stringify(after), JSON.stringify(detail), now.toISOString()));
    }
}
