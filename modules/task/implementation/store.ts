import { randomUUID } from "node:crypto";
import { all, one, exec, type GateDatabase, type Program } from "../sprint-gates/query.js";
import { PlanningError } from "../planning/contracts.js";
import { reviewFingerprint, reviewState } from "./state.js";
import type { ImplementationAction, ImplementationReview, ImplementationSubject, ImplementationTask } from "./contracts.js";

export class ImplementationStore {
  constructor(private readonly db: GateDatabase) {}

  private *read(team: string, project: string, subject: ImplementationSubject): Program<ImplementationReview> {
    const rows = yield* all<Omit<ImplementationTask, "isBacklog"> & { isBacklog: number }>(`SELECT l.task_id AS id,
      COALESCE(t.title, '削除済み・所属変更') AS title, COALESCE(t.status, 'missing') AS status,
      COALESCE(v.revision, 0) AS revision, l.specification_revision AS specificationRevision, l.is_backlog AS isBacklog
      FROM pf_implementation_links l LEFT JOIN tasks t ON t.id = l.task_id AND t.team_id = l.team_id
      LEFT JOIN pf_implementation_task_versions v ON v.task_id = l.task_id
      WHERE l.team_id = ? AND l.project_id = ? AND l.subject_kind = ? AND l.subject_id = ? ORDER BY l.task_id`,
      team, project, subject.kind, subject.id);
    const tasks = rows.map(row => ({ ...row, isBacklog: Boolean(row.isBacklog) }));
    const fingerprint = reviewFingerprint(subject, tasks);
    const confirmation = (yield* one<NonNullable<ImplementationReview["confirmation"]>>(`SELECT actor_id AS actorId, confirmed_at AS confirmedAt, note
      FROM pf_implementation_reviews WHERE team_id = ? AND project_id = ? AND subject_kind = ? AND subject_id = ? AND fingerprint = ?`,
      team, project, subject.kind, subject.id, fingerprint)) ?? null;
    return { kind: subject.kind, id: subject.id, title: subject.title, specificationRevision: subject.revision,
      fingerprint, tasks, confirmation, state: reviewState(subject, tasks, confirmation) };
  }

  list(team: string, project: string, subjects: ImplementationSubject[]): Promise<ImplementationReview[]> {
    const store = this;
    return this.db.transaction(team, function* () {
      const reviews: ImplementationReview[] = [];
      for (const subject of subjects) reviews.push(yield* store.read(team, project, subject));
      return reviews;
    }, { lockTasks: false });
  }

  change(team: string, project: string, subject: ImplementationSubject, actor: string, input: ImplementationAction, now: Date): Promise<ImplementationReview> {
    const store = this;
    return this.db.transaction(team, function* () {
      const before = yield* store.read(team, project, subject);
      if (before.fingerprint !== input.fingerprint) throw new PlanningError("仕様またはタスクが変更されています。再読み込みしてください");
      if (input.action === "confirm") {
        if (before.state !== "awaiting_confirmation") throw new PlanningError("現行仕様のタスク完了後に人間が確認してください");
        yield* exec(`INSERT INTO pf_implementation_reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(), team, project, subject.kind, subject.id, before.fingerprint, actor, input.note, now.toISOString());
      } else {
        let taskId: string;
        if (input.action === "backlog") {
          if (!(yield* one(`SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?`, team, input.assigneeId)))
            throw new PlanningError("チームの担当者を指定してください", 400);
          taskId = randomUUID();
          const timestamp = store.db.timestamp(now);
          yield* exec(`INSERT INTO tasks (id, owner_id, assignee_id, project_id, team_id, lane, title, description, requirements,
            status, priority, deadline, estimated_minutes, creator_type, kind, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'backlog', ?, ?, ?, 'open', 'medium', ?, ?, 'human', 'task', ?, ?)`,
            taskId, actor, input.assigneeId, `pf:${project}`, team, input.title, input.note,
            `Pf ${subject.kind}/${subject.id}\n仕様版: ${subject.revision}\n${subject.description}`, store.db.timestamp(new Date(input.deadline)), input.estimatedMinutes, timestamp, timestamp);
        } else {
          taskId = input.taskId;
          if (!(yield* one(`SELECT id FROM tasks WHERE id = ? AND team_id = ? AND kind = 'task'`, taskId, team)))
            throw new PlanningError("同じチームのタスクを指定してください", 400);
        }
        yield* exec(`INSERT INTO pf_implementation_links VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(team_id, project_id, subject_kind, subject_id, task_id) DO UPDATE SET
          specification_revision = excluded.specification_revision, actor_id = excluded.actor_id, note = excluded.note, linked_at = excluded.linked_at`,
          team, project, subject.kind, subject.id, taskId, subject.revision,
          input.action === "backlog" && before.tasks.length > 0 ? 1 : 0, actor, input.note, now.toISOString());
      }
      return yield* store.read(team, project, subject);
    });
  }
}
