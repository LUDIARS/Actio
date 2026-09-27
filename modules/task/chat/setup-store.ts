// @implements AT-SPRINT-CHAT-INTEGRATION
import { randomUUID } from "node:crypto";
import { all, one, exec } from "../sprint-gates/query.js";
import { defaultTeamSettings } from "../team/settings.js";
import { ChatRecords, readRecord, writeRecord, requireRevision } from "./records.js";
import { ChatError, type Connection } from "./contracts.js";

export class ChatSetupStore {
  constructor(private readonly records: ChatRecords) {}
  async changeDestination(value: Omit<Connection, "revision">, revision: number, actor: string, now: Date): Promise<Connection> {
    const owner = `destination-${randomUUID()}`;
    if (!await this.records.lease(owner, now, 300_000)) throw new ChatError("配送処理中です。停止したまま少し待って再試行してください");
    try { return await this.saveConnection(value, revision, now, actor); }
    finally { await this.records.releaseLease(owner); }
  }
  createTeam(name: string, actor: string, now: Date): Promise<string> {
    const id = `at-team-${randomUUID()}`;
    const timestamp = this.records.database.timestamp(now);
    return this.records.transaction(id, function* () {
      yield* exec("INSERT INTO team_refs(id,slug,name,cc_settings,settings,synced_at) VALUES(?,?,?,?,?,?)", id, id, name,
        JSON.stringify({ origin: "actio" }), JSON.stringify(defaultTeamSettings()), timestamp);
      yield* exec("INSERT INTO team_members(team_id,user_id,role) VALUES(?,?,'leader')", id, actor);
      yield* writeRecord(id, "local-team", id, { id, actor, createdAt: now.toISOString() }, now);
      return id;
    });
  }
  createProject(code: string, name: string, teams: string[], actor: string, now: Date): Promise<string> {
    const id = `local:${code}`;
    const timestamp = this.records.database.timestamp(now);
    return this.records.transaction("chat-projects", function* () {
      if (yield* one("SELECT 1 FROM project_refs WHERE code=?", id)) throw new ChatError("同じコードのプロジェクトが存在します");
      for (const team of teams) {
        const member = yield* one<{ role: string }>("SELECT role FROM team_members WHERE team_id=? AND user_id=?", team, actor);
        if (member?.role !== "leader") throw new ChatError("所属先すべてのチームのリーダー権限が必要です", 403);
      }
      yield* exec("INSERT INTO project_refs(code,name,team_ids,synced_at,removed_at) VALUES(?,?,?,?,NULL)", id, name, JSON.stringify([...new Set(teams)]), timestamp);
      yield* writeRecord(teams[0], "local-project", id, { code: id, actor, teamIds: teams }, now);
      return id;
    });
  }
  saveConnection(value: Omit<Connection, "revision">, revision: number, now: Date, destinationActor?: string): Promise<Connection> {
    return this.records.transaction("chat-connections", function* () {
      const current = yield* readRecord<Connection>(value.teamId, "connection", value.platform);
      requireRevision(current?.revision ?? 0, revision);
      // One monitored channel cannot import the same humans' messages into unrelated teams.
      const existing = (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE kind='connection'"))
        .map(row => JSON.parse(row.body) as Connection);
      if (existing.some(c => c.teamId === value.teamId && c.platform !== value.platform))
        throw new ChatError("チームの接続先はDiscordまたはSlackの一方です。履歴を維持する移行が必要です");
      if (existing.some(c => c.teamId !== value.teamId && c.platform === value.platform && c.workspaceId === value.workspaceId && c.backlogChannelId === value.backlogChannelId))
        throw new ChatError("このチャンネルは別チームへ接続済みです");
      const moving = current && (current.workspaceId !== value.workspaceId || current.backlogChannelId !== value.backlogChannelId);
      if (moving) {
        if (!destinationActor) throw new ChatError("履歴を保護するため通常の設定保存では接続先を変更できません。停止して投稿先変更を使用してください");
        if (current.enabled || value.enabled) throw new ChatError("投稿先変更の前後は接続を停止してください");
        const blockers = yield* all("SELECT id FROM task_chat_records WHERE team_id=? AND (kind IN ('intake','surface') OR (kind='outbox' AND state<>'sent')) LIMIT 1", value.teamId);
        if (blockers.length) throw new ChatError("受付・スプリント・未完了配送があるため投稿先を変更できません");
        yield* writeRecord(value.teamId, "connection-history", `${current.platform}:${current.revision}`, { connection: current, actor: destinationActor, changedAt: now.toISOString() }, now);
      }
      const saved = { ...value, revision: revision + 1, enabledAt: value.enabled && !current?.enabled ? now.toISOString() : current?.enabledAt };
      yield* writeRecord(value.teamId, "connection", value.platform, saved, now, value.enabled ? "enabled" : "disabled", saved.revision);
      return saved;
    });
  }
}
