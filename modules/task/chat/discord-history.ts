// @implements AT-SPRINT-CHAT-INTEGRATION
import { z } from "zod";
import { DiscordRest, type DiscordMessage } from "./discord-rest.js";
import type { IncomingMessage } from "./contracts.js";

const cursorSchema = z.object({ last: z.string().nullable(), before: z.string().nullable(), high: z.string().nullable() });
/** Backfill is resumable across pages; the live high-water mark advances only after reaching the previous mark. */
export async function discordHistory(rest: DiscordRest, guild: string, channel: string, parent: string | null, cursor: string | null): Promise<{
  messages: IncomingMessage[]; cursor: string | null; complete: boolean;
}> {
  const state = cursor ? cursorSchema.parse(JSON.parse(cursor)) : { last: null, before: null, high: null };
  const page = await rest.call<DiscordMessage[]>(`/channels/${channel}/messages?limit=100${state.before ? `&before=${state.before}` : ""}`);
  const sorted = [...page].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  const newest = sorted.at(-1)?.id ?? null;
  const high = state.high ?? newest ?? state.last;
  const complete = page.length < 100 || !!(state.last && sorted.some(m => BigInt(m.id) <= BigInt(state.last!)));
  const next = complete ? { last: high, before: null, high: null } : { ...state, high, before: sorted[0]?.id ?? null };
  // Include overlapping recent messages to capture edits without treating them as new intakes.
  return { complete, cursor: JSON.stringify(next), messages: sorted.map(m => ({
    id: m.id, channelId: channel, parentId: parent, content: m.content,
    externalActorId: m.author.bot || m.webhook_id ? null : m.author.id,
    bot: !!m.author.bot || !!m.webhook_id, deleted: false,
    occurredAt: m.timestamp, editedAt: m.edited_timestamp,
    url: `https://discord.com/channels/${guild}/${channel}/${m.id}`,
    attachments: m.attachments.map(a => ({ name: a.filename, url: a.url })),
  })) };
}
