// @implements AT-SPRINT-CHAT-INTEGRATION
import type { Connection, Message, Transport } from "./contracts.js";
import { ChatRecords } from "./records.js";
import { IntakeStore } from "./intake-store.js";
import { conversation } from "./discussion.js";

interface Cursor { value: string | null; complete: boolean; at: string; deletionOffset: number }
export async function ingestChannel(records: ChatRecords, connection: Connection, transport: Transport,
  channel: string, now: Date): Promise<boolean> {
  const old = await records.get<Cursor>(connection.teamId, "cursor", channel);
  const page = await transport.messages(connection, channel, old?.value ?? null);
  const intake = new IntakeStore(records);
  for (const raw of page.messages) {
    // External actor IDs are never copied to Actio's identity store. Human approval happens in the authenticated Web UI.
    const { externalActorId: _external, ...body } = raw;
    const message: Message = { ...body, teamId: connection.teamId, actorId: null };
    await intake.receive(message, connection.backlogChannelId, now, connection.enabledAt);
  }
  // Rotating reconciliation eventually removes old deleted messages too, not just the latest history page.
  const saved = (await conversation(records, connection.teamId, channel)).filter(m => !m.deleted);
  const offset = (old?.deletionOffset ?? 0) % Math.max(saved.length, 1);
  const check = saved.slice(offset, offset + 5);
  const deleted = await transport.deleted(connection, channel, check.map(m => m.id));
  for (const message of check.filter(m => deleted.includes(m.id))) {
    await intake.receive({ ...message, content: "", attachments: [], deleted: true }, connection.backlogChannelId, now, connection.enabledAt);
  }
  await records.save(connection.teamId, "cursor", channel, {
    value: page.cursor, complete: page.complete, at: now.toISOString(), deletionOffset: offset + check.length,
  } satisfies Cursor, now);
  return page.complete;
}
