// @implements AT-SPRINT-CHAT-INTEGRATION
import { createHash } from "node:crypto";
import { all, one, exec } from "../sprint-gates/query.js";
import { ChatRecords, readRecord, writeRecord, requireRevision } from "./records.js";
import { enqueue } from "./outbox.js";
import { backlogCommand } from "./triggers.js";
import { requireIntakeInformation } from "./intake-requirements.js";
import { ChatError, type Message, type Intake, type IntakeReview, type Confirmation } from "./contracts.js";

export class IntakeStore {
  constructor(private readonly records: ChatRecords) {}
  receive(message: Message, backlogChannelId: string, now: Date, enabledAt = "", allowNew = true): Promise<void> {
    return this.records.transaction(message.teamId, function* () {
      const prior = yield* readRecord<Message>(message.teamId, "message", message.id);
      if (prior && JSON.stringify(prior) === JSON.stringify(message)) return;
      yield* writeRecord(message.teamId, "message", message.id, message, now);
      const candidates = (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind='intake'", message.teamId))
        .map(row => JSON.parse(row.body) as Intake);
      const existing = candidates.find(i => i.messageId === message.id || i.sourceMessageId === message.id || i.threadId === message.channelId);
      if (message.bot && !message.intakeRequest && existing?.sourceMessageId !== message.id) return;
      const command = message.channelId === backlogChannelId ? message.intakeRequest?.text ?? backlogCommand(message.content) : null;
      if (!existing && (!allowNew || command === null || message.deleted || message.occurredAt < enabledAt)) return;
      const sourceId = existing?.sourceMessageId ?? message.intakeRequest?.target?.messageId;
      const duplicate = !existing && candidates.find(i => (i.sourceMessageId ?? i.messageId) === (sourceId ?? message.id));
      if (duplicate) {
        yield* enqueue(message.teamId, `intake-duplicate:${message.id}`, { kind: "message", channelId: backlogChannelId,
          text: `${message.url}\nこの投稿は受付済みです（${duplicate.id.slice(0, 8)}）。既存の確認スレッドに補足してください。` }, now);
        return;
      }
      const id = existing?.id ?? createHash("sha256").update(`${message.teamId}:${message.id}`).digest("hex").slice(0, 32);
      // Rebuild from current message bodies so edits/deletions cannot leave stale private content in intake text.
      const messages = (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind='message' ORDER BY updated_at,id", message.teamId))
        .map(row => JSON.parse(row.body) as Message)
        .filter(m => (!m.bot || !!m.intakeRequest || m.id === sourceId) && !m.deleted && (m.id === sourceId || m.id === (existing?.messageId ?? message.id) || (existing?.threadId && m.channelId === existing.threadId)))
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
      const root = messages.find(m => m.id === (existing?.messageId ?? message.id));
      const source = sourceId ? messages.find(m => m.id === sourceId) : root;
      const content = messages.map(m => m.id === sourceId ? m.content : m.intakeRequest?.text ?? m.content).filter(Boolean).join("\n\n");
      if (existing?.state === "registered") {
        // The confirmed task is a human-authored snapshot; the source view still follows edits/deletions.
        yield* writeRecord(message.teamId, "intake", existing.id, { ...existing, content, review: null, sourceDeleted: !root || !source }, now, existing.state, existing.revision);
        return;
      }
      const intake: Intake = { id, teamId: message.teamId, channelId: backlogChannelId, messageId: existing?.messageId ?? message.id,
        threadId: existing?.threadId ?? null, revision: (existing?.revision ?? 0) + 1, content,
        ...(sourceId ? { sourceMessageId: sourceId } : {}),
        sourceDeleted: !root || !source, state: content.length > 24000 ? "needs_review" : "checking", review: null, reviewedRevision: null,
        reviewError: content.length > 24000 ? "会話が審査上限を超えています。内容を整理して人間が確認してください" : null, taskId: null, confirmedBy: null };
      yield* writeRecord(message.teamId, "intake", id, intake, now, intake.state, intake.revision);
      if (!existing) {
        yield* enqueue(message.teamId, `intake-thread:${id}`, { kind: "thread", channelId: backlogChannelId, messageId: message.id,
          intakeId: id, name: (command || "バックログ内容確認").split("\n")[0].slice(0, 80) }, now);
        yield* enqueue(message.teamId, `intake-received:${id}`, { kind: "message", channelId: backlogChannelId,
          text: `受付 ${id.slice(0, 8)}: 内容確認用のスレッドを作成します。不足情報への回答・補足は、そのスレッドへ投稿してください。\n元投稿: ${source?.url ?? message.url}` }, now);
      }
    });
  }
  review(team: string, id: string, revision: number, value: IntakeReview | null, error: string | null, now: Date): Promise<void> {
    value = value ? requireIntakeInformation(value) : null;
    return this.records.transaction(team, function* () {
      const intake = yield* readRecord<Intake>(team, "intake", id);
      if (!intake || intake.revision !== revision || intake.state === "registered") return;
      const state = value?.questions.length ? "needs_information" : "needs_review";
      const next = { ...intake, review: value, reviewedRevision: revision, reviewError: error, state } as Intake;
      yield* writeRecord(team, "intake", id, next, now, state, revision);
      if (intake.threadId) {
        const text = value
          ? [`確認案: ${value.title}`, `目的: ${value.purpose || "未記載"}`, `変更: ${value.change || "未記載"}`,
            "完了条件:", ...value.acceptance.map(s => `・${s}`), "確認事項:", ...value.questions.map(s => `・${s}`),
            ...value.concerns.map(s => `検討: ${s}`), "補足はこのスレッドへ。内容確認後、Actioの受付画面で確定してください。"].join("\n")
          : "内容の妥当性審査を実行できません。Actioの受付画面で目的・変更範囲・完了条件を補い、確認理由を記入してください。";
        yield* enqueue(team, `intake-review:${id}:${revision}`, { kind: "message", channelId: intake.threadId, text }, now);
      }
    });
  }
  confirm(team: string, id: string, actor: string, input: Confirmation, now: Date, requireLeader = true): Promise<string> {
    const timestamp = this.records.database.timestamp(now);
    const deadline = input.deadline ? this.records.database.timestamp(new Date(input.deadline)) : null;
    return this.records.database.transaction(team, function* () {
      const intake = yield* readRecord<Intake>(team, "intake", id);
      if (!intake) throw new ChatError("受付が見つかりません", 404);
      const member = yield* one<{ role: string }>("SELECT role FROM team_members WHERE team_id=? AND user_id=?", team, actor);
      if (requireLeader && member?.role !== "leader") throw new ChatError("確定にはチームリーダー権限が必要です", 403);
      requireRevision(intake.revision, input.revision);
      if (intake.taskId) return intake.taskId;
      if (intake.sourceDeleted) throw new ChatError("元投稿が削除されています。新しい投稿から登録してください");
      if (input.assigneeId && !(yield* one("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?", team, input.assigneeId)))
        throw new ChatError("担当者がチームに所属していません", 400);
      if (input.projectId) {
        const project = yield* one<{ team_ids: string | string[] }>("SELECT team_ids FROM project_refs WHERE code=? AND removed_at IS NULL", input.projectId);
        const teams: string[] = project ? typeof project.team_ids === "string" ? JSON.parse(project.team_ids) : project.team_ids : [];
        if (!teams.includes(team)) throw new ChatError("プロジェクトがチームに所属していません", 400);
      }
      const taskId = `chat-${id}`;
      yield* exec(`INSERT INTO tasks(id,owner_id,assignee_id,project_id,team_id,lane,title,description,requirements,status,priority,deadline,source,source_ref,creator_type,kind,created_at,updated_at)
        VALUES(?,?,?,?,?,'backlog',?,?,?,'open','medium',?,'chat-intake',?,'human','task',?,?)`,
      taskId, actor, input.assigneeId, input.projectId, team, input.title, `${input.purpose}\n\n${input.change}`,
      `${input.acceptance.map(s => `- ${s}`).join("\n")}\n\n確認理由: ${input.reviewNote}`, deadline, `${team}:${id}`, timestamp, timestamp);
      const confirmed = { ...intake, state: "registered", taskId, confirmedBy: actor } as Intake;
      yield* writeRecord(team, "intake", id, confirmed, now, "registered", intake.revision);
      yield* writeRecord(team, "intake-confirmation", id, { actor, input, at: now.toISOString() }, now);
      if (intake.threadId) yield* enqueue(team, `intake-confirmed:${id}`, { kind: "message", channelId: intake.threadId,
        text: `バックログに登録しました: ${input.title}\nタスク: ${taskId}\n${input.reviewNote}` }, now);
      yield* enqueue(team, `intake-confirmed-public:${id}`, { kind: "message", channelId: intake.channelId,
        text: `バックログに登録しました: ${input.title}\nタスク: ${taskId}\n受付: ${id.slice(0, 8)}` }, now);
      return taskId;
    });
  }
}
