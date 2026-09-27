// @implements AT-SPRINT-CHAT-INTEGRATION
import type { IncomingMessage } from "./contracts.js";
import type { ConcordiaRequest } from "./concordia-request.js";
export interface SlackMessage { ts: string; text?: string; user?: string; bot_id?: string; subtype?: string; reply_count?: number; edited?: { ts: string }; files?: { name?: string; permalink?: string }[] }
export interface SlackPage { messages: SlackMessage[]; has_more?: boolean; response_metadata?: { next_cursor?: string } }
export function splitSlackChannel(value: string): { channel: string; thread?: string } {
  const [channel, thread] = value.split("~"); return { channel, thread };
}
export async function slackHistory(api: ConcordiaRequest, workspace: string, id: string, raw: string | null): Promise<{ messages: IncomingMessage[]; cursor: string; complete: boolean }> {
  const target = splitSlackChannel(id);
  const cursor = raw ? JSON.parse(raw) as { last: string; next: string; high: string } : { last: "0", next: "", high: "0" };
  const page = await api.slack<SlackPage>(target.thread ? "conversations.replies" : "conversations.history", {
    channel: target.channel, ...(target.thread ? { ts: target.thread } : {}), oldest: cursor.last, inclusive: true, limit: 100, ...(cursor.next ? { cursor: cursor.next } : {}),
  });
  const high = page.messages.reduce((value, m) => Number(m.ts) > Number(value) ? m.ts : value, cursor.high);
  const next = page.response_metadata?.next_cursor ?? "";
  if (page.has_more && !next) throw new Error("Slack pagination incomplete");
  return { complete: !next, cursor: JSON.stringify(next ? { ...cursor, next, high } : { last: high, next: "", high }),
    messages: page.messages.filter(m => !target.thread || m.ts !== target.thread).map(m => ({
      id: `${target.channel}:${m.ts}`, channelId: id, parentId: target.thread ? target.channel : null,
      content: m.text ?? "", externalActorId: m.user ?? null, bot: !!m.bot_id || m.subtype === "bot_message", deleted: false,
      occurredAt: new Date(Number(m.ts) * 1000).toISOString(), editedAt: m.edited ? new Date(Number(m.edited.ts) * 1000).toISOString() : null,
      url: `https://app.slack.com/client/${encodeURIComponent(workspace)}/${target.channel}/thread/${target.channel}-${target.thread ?? m.ts}`,
      attachments: (m.files ?? []).filter(f => f.permalink).map(f => ({ name: f.name ?? "添付", url: f.permalink! })),
    })) };
}
