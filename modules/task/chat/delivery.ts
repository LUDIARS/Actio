// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatOutbox } from "./outbox.js";
import { ChatRecords } from "./records.js";
import { conversation, type DiscussionSetting } from "./discussion.js";
import { ingestChannel } from "./ingestion.js";
import { ChatError, type Connection, type Operation, type Transport } from "./contracts.js";
import { isBotCommand } from "./triggers.js";

export async function deliverPending(records: ChatRecords, connection: Connection, transport: Transport,
  now: () => Date, ownsLease: () => Promise<boolean>): Promise<void> {
  const outbox = new ChatOutbox(records);
  for (const operation of await outbox.pending(connection.teamId)) {
    if (!await ownsLease()) return;
    const active = await records.get<Connection>(connection.teamId, "connection", connection.platform);
    if (!active?.enabled) return;
    if (operation.payload.kind === "archive") {
      const root = operation.payload.channelId;
      const channels = (await records.allForTeam<{ id: string; parentId: string | null }>(connection.teamId, "channel"))
        .filter(c => c.id === root || c.parentId === root);
      let complete = channels.length > 0;
      for (const channel of channels) {
        const cursor = await records.get<{ complete: boolean; at: string }>(connection.teamId, "cursor", channel.id);
        complete &&= !!cursor?.complete && Date.parse(cursor.at) >= Date.parse(operation.createdAt);
      }
      if (!complete) continue;
    }
    const discussion = await records.get<{ channelId: string; sourceMessageId: string; sourceContent: string; settingRevision: number }>(connection.teamId, "discussion-delivery", operation.id);
    if (discussion && operation.state === "queued") {
      // Recheck after generation; humans may have replied while Di was thinking.
      await ingestChannel(records, connection, transport, discussion.channelId, now());
      const setting = await records.get<DiscussionSetting>(connection.teamId, "discussion-setting", discussion.channelId);
      const latest = (await conversation(records, connection.teamId, discussion.channelId))
        .filter(m => !m.deleted && !m.bot && !isBotCommand(m.content)).at(-1);
      if (!setting?.enabled || setting.revision !== discussion.settingRevision || latest?.id !== discussion.sourceMessageId || latest.content !== discussion.sourceContent) {
        await records.save(connection.teamId, "outbox", operation.id, { ...operation, state: "failed", lastError: "会話または参加設定が更新されたため発言案を取り消しました" } satisfies Operation, now(), "failed");
        continue;
      }
    }
    const claimed = await outbox.claim(operation, now());
    if (!claimed) continue;
    try { await outbox.finish(claimed, await transport.deliver(connection, claimed), now()); }
    catch (error) { await outbox.finish(claimed, error instanceof Error ? error : new ChatError("配送失敗", 503), now()); }
  }
}
