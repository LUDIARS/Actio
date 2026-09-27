// @implements AT-SPRINT-CHAT-INTEGRATION
import { z } from "zod";
import { secretManager } from "../../../src/config/secrets.js";
import { all } from "../sprint-gates/query.js";
import { ChatRecords, readRecord, writeRecord } from "./records.js";
import { enqueue, operationId } from "./outbox.js";
import { ChatError, type Connection, type Message } from "./contracts.js";
import { isBotCommand } from "./triggers.js";

export interface DiscussionSetting { channelId: string; enabled: boolean; revision: number; enabledAt: string }
const responseSchema = z.object({ status: z.enum(["disabled", "waiting", "busy", "skipped", "proposal"]),
  proposalId: z.string().regex(/^[a-f0-9]{64}$/).optional(), text: z.string().max(1200).optional(),
  stance: z.enum(["pro", "con"]).optional(), sourceMessageId: z.string().max(200).optional() });

/** Di owns participation decisions; Actio owns consent, current conversation and delivery. */
export async function considerDiscussion(records: ChatRecords, connection: Connection, setting: DiscussionSetting,
  now: Date, signal: AbortSignal): Promise<void> {
  if (!setting.enabled || !connection.enabled) return;
  const base = secretManager.get("DISCUTERE_URL");
  const key = secretManager.get("DISCUTERE_EXTERNAL_DISCUSSION_SECRET");
  if (!base || !key) throw new ChatError("議論参加を利用できません。Diの接続設定が必要です", 503);
  const messages = await conversation(records, connection.teamId, setting.channelId);
  const context = messages.filter(m => !m.deleted && !isBotCommand(m.content));
  const human = context.filter(m => !m.bot).at(-1);
  if (!human || human.occurredAt < setting.enabledAt) return;
  // Bound at complete-message boundaries, preserving the most recent conversation.
  let size = 0;
  const recent: Message[] = [];
  for (const message of context.slice().reverse()) {
    if (size + message.content.length > 32000 || recent.length >= 80) break;
    recent.unshift(message); size += message.content.length;
  }
  const url = new URL("internal/external-discussion/consider", base.replace(/\/?$/, "/"));
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ scene: `actio:${operationId(`${connection.teamId}:${connection.platform}:${connection.workspaceId}:${setting.channelId}`)}`,
      enabled: true, messages: recent.map(m => ({ id: m.id, kind: m.bot ? "ai" : "human", text: m.content, at: Date.parse(m.occurredAt) })) }),
    redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(100_000)]) });
  if (!response.ok) throw new ChatError(`議論参加を利用できません (Di HTTP ${response.status})`, 503);
  const proposal = responseSchema.parse(await response.json());
  if (proposal.status !== "proposal") return;
  if (!proposal.proposalId || !proposal.text?.trim() || proposal.sourceMessageId !== human.id) throw new ChatError("Diの発言案が現在の会話に対応していません", 503);
  await records.transaction(connection.teamId, function* () {
    const current = yield* readRecord<DiscussionSetting>(connection.teamId, "discussion-setting", setting.channelId);
    const active = yield* readRecord<Connection>(connection.teamId, "connection", connection.platform);
    if (!active?.enabled || !current?.enabled || current.revision !== setting.revision) return;
    const latest = (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind='message'", connection.teamId))
      .map(row => JSON.parse(row.body) as Message).filter(m => m.channelId === setting.channelId && !m.bot && !m.deleted && !isBotCommand(m.content))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)).at(-1);
    if (!latest || latest.id !== human.id || latest.content !== human.content) return;
    const opKey = `di-proposal:${proposal.proposalId}`;
    yield* enqueue(connection.teamId, opKey, { kind: "message", channelId: setting.channelId, text: `Di: ${proposal.text}` }, now);
    yield* writeRecord(connection.teamId, "discussion-delivery", operationId(opKey), {
      channelId: setting.channelId, sourceMessageId: human.id, sourceContent: human.content,
      settingRevision: setting.revision, platform: connection.platform,
    }, now);
  });
}

export function conversation(records: ChatRecords, team: string, channel: string): Promise<Message[]> {
  return records.transaction(team, function* () {
    return (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind='message'", team))
      .map(row => JSON.parse(row.body) as Message).filter(m => m.channelId === channel)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  });
}
