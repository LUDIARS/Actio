// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatError } from "./contracts.js";

export class DiscordRest {
  constructor(private readonly token: string, private readonly signal: AbortSignal, private readonly request: typeof fetch = fetch) {
    if (!token.trim()) throw new ChatError("Discord Bot の資格情報が未設定です", 503);
  }
  async call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await this.request(`https://discord.com/api/v10${path}`, {
      method, headers: { authorization: `Bot ${this.token}`, "content-type": "application/json; charset=utf-8" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error",
      signal: AbortSignal.any([this.signal, AbortSignal.timeout(20000)]),
    });
    if (!response.ok) throw new ChatError(`Discord API HTTP ${response.status}`, response.status === 403 || response.status === 400 ? 400 : 503);
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
}
export interface DiscordChannel {
  id: string; type: number; guild_id?: string; parent_id?: string | null; topic?: string | null;
  permission_overwrites?: { id: string; type: number; allow: string; deny: string }[];
  thread_metadata?: { archived: boolean; locked: boolean };
}
export interface DiscordMessage {
  id: string; channel_id: string; content: string; timestamp: string; edited_timestamp: string | null;
  author: { id: string; bot?: boolean }; webhook_id?: string;
  attachments: { filename: string; url: string }[];
  application_id?: string;
  interaction_metadata?: { type: number };
  interaction?: { type: number };
  embeds?: { footer?: { text: string }; description?: string }[];
  message_reference?: { channel_id?: string; message_id?: string; guild_id?: string };
}
export function splitChatText(text: string, limit = 1750): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let split = remaining.lastIndexOf("\n", limit);
    if (split < limit / 2) split = limit;
    // Preserve UTF-16 surrogate pairs at a hard boundary.
    if (/[\uD800-\uDBFF]/u.test(remaining[split - 1])) split--;
    parts.push(remaining.slice(0, split)); remaining = remaining.slice(split);
  }
  if (remaining || !parts.length) parts.push(remaining);
  return parts;
}
