// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatError, type Connection, type Operation, type Transport, type IncomingMessage } from "./contracts.js";
import { DiscordRest, splitChatText, type DiscordChannel, type DiscordMessage } from "./discord-rest.js";
import { discordHistory } from "./discord-history.js";

const VIEW_CHANNEL = 1024n;
const WRITE = 2048n | 64n | (1n << 35n) | (1n << 36n) | (1n << 38n);
export class DiscordTransport implements Transport {
  async threads(connection: Connection, channelId: string): Promise<string[]> {
    await this.channel(connection, channelId);
    const active = await this.rest.call<{ threads: DiscordChannel[] }>(`/guilds/${connection.workspaceId}/threads/active`);
    const ids = new Set(active.threads.filter(t => t.parent_id === channelId && t.type === 11).map(t => t.id));
    let before = "";
    for (let page = 0; page < 100; page++) {
      const result = await this.rest.call<{ threads: (DiscordChannel & { thread_metadata: { archive_timestamp: string } })[]; has_more: boolean }>(
        `/channels/${channelId}/threads/archived/public?limit=100${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      for (const thread of result.threads) ids.add(thread.id);
      if (!result.has_more) return [...ids];
      const next = result.threads.at(-1)?.thread_metadata.archive_timestamp;
      if (!next || next === before) break;
      before = next;
    }
    throw new ChatError("スレッド履歴の取得上限に達しました。保管は未完了です", 503);
  }
  async deleted(connection: Connection, channelId: string, ids: string[]): Promise<string[]> {
    await this.channel(connection, channelId);
    const removed: string[] = [];
    for (const id of ids) {
      try { await this.rest.call(`/channels/${channelId}/messages/${id}`); }
      catch (error) {
        if (error instanceof ChatError && error.message.includes("HTTP 404")) removed.push(id);
        else throw error;
      }
    }
    return removed;
  }
  private me: string | null = null;
  constructor(private readonly rest: DiscordRest) {}
  close(): void { /* HTTP calls are owned by the runtime AbortSignal; no sockets or timers are retained. */ }
  private async channel(connection: Connection, id: string): Promise<DiscordChannel> {
    const channel = await this.rest.call<DiscordChannel>(`/channels/${encodeURIComponent(id)}`);
    if (channel.guild_id !== connection.workspaceId) throw new ChatError("チャンネルのサーバーが一致しません", 400);
    if (channel.type !== 0 && channel.type !== 11) throw new ChatError("通常のテキストチャンネルと公開スレッドのみ対応します", 400);
    if (channel.permission_overwrites?.some(p => (BigInt(p.deny) & VIEW_CHANNEL) !== 0n)) throw new ChatError("閲覧制限のあるチャンネルは対応していません", 400);
    return channel;
  }
  async validate(connection: Connection): Promise<void> {
    const channel = await this.channel(connection, connection.backlogChannelId);
    if (channel.type !== 0) throw new ChatError("受付には通常のテキストチャンネルを指定してください", 400);
    // Until a provider ACL-to-team mapping is configured, do not expose restricted channel logs to an entire team.
    if (channel.permission_overwrites?.some(p => (BigInt(p.deny) & VIEW_CHANNEL) !== 0n))
      throw new ChatError("閲覧制限のあるチャンネルはWebログの権限対応が必要です。公開範囲がチームと一致するチャンネルを使用してください", 400);
    for (const id of [connection.categoryId, connection.archiveCategoryId].filter((v): v is string => !!v)) {
      const category = await this.rest.call<DiscordChannel>(`/channels/${id}`);
      if (category.type !== 4 || category.guild_id !== connection.workspaceId) throw new ChatError("保管先/作成先カテゴリが不正です", 400);
    }
    this.me = (await this.rest.call<{ id: string }>("/users/@me")).id;
  }
  async messages(connection: Connection, channelId: string, cursor: string | null): Promise<{ messages: IncomingMessage[]; cursor: string | null; complete: boolean }> {
    const channel = await this.channel(connection, channelId);
    return discordHistory(this.rest, connection.workspaceId, channelId, channel.type === 11 ? channel.parent_id ?? null : null, cursor);
  }
  private async findMessage(channel: string, marker: string, createdAt: string): Promise<string | null> {
    let before: string | null = null;
    for (let page = 0; page < 30; page++) {
      const messages: DiscordMessage[] = await this.rest.call(`/channels/${channel}/messages?limit=100${before ? `&before=${before}` : ""}`);
      const found = messages.find(m => m.author.id === this.me && !m.webhook_id && m.content.endsWith(marker));
      if (found) return found.id;
      if (messages.length < 100 || messages.some(m => m.timestamp < createdAt)) return null;
      before = messages.at(-1)?.id ?? null;
    }
    throw new ChatError("配送履歴の照合が終わっていません。再送せず確認を待っています", 503);
  }
  async deliver(connection: Connection, operation: Operation): Promise<{ id: string }> {
    const op = operation.payload;
    if (!this.me) this.me = (await this.rest.call<{ id: string }>("/users/@me")).id;
    if (op.kind === "channel") {
      const marker = `actio-sprint:${connection.teamId}:${op.sprintId}`;
      const channels = await this.rest.call<DiscordChannel[]>(`/guilds/${connection.workspaceId}/channels`);
      const matches = channels.filter(c => c.topic === marker && c.type === 0);
      if (matches.length > 1) throw new ChatError("同じスプリントのチャンネルが複数あります", 503);
      if (matches[0]) return { id: matches[0].id };
      if (operation.state !== "queued") throw new ChatError("チャンネル作成の結果が不明です。外部状態を確認してください", 503);
      const created = await this.rest.call<DiscordChannel>(`/guilds/${connection.workspaceId}/channels`, "POST", {
        name: op.name.slice(0, 90), type: 0, topic: marker, parent_id: connection.categoryId ?? null,
      });
      return { id: created.id };
    }
    const channel = await this.channel(connection, op.channelId);
    if (op.kind === "thread") {
      // Discord threads created from messages have the starter message's ID, making lost responses reconcilable.
      try {
        const existing = await this.rest.call<DiscordChannel>(`/channels/${op.messageId}`);
        if (existing.type === 11 && existing.parent_id === op.channelId) return { id: existing.id };
      } catch (error) {
        if (!(error instanceof ChatError) || !error.message.includes("HTTP 404")) throw error;
      }
      if (operation.state !== "queued") throw new ChatError("スレッド作成結果が不明です。照合を待っています", 503);
      const created = await this.rest.call<DiscordChannel>(`/channels/${op.channelId}/messages/${op.messageId}/threads`, "POST", { name: op.name, auto_archive_duration: 10080 });
      return { id: created.id };
    }
    if (op.kind === "archive") {
      if (!connection.archiveCategoryId) throw new ChatError("保管カテゴリを設定してください", 400);
      if (channel.topic !== `actio-sprint:${connection.teamId}:${op.sprintId}`) throw new ChatError("Actioが管理するスプリントチャンネルではありません", 400);
      for (const id of await this.threads(connection, channel.id))
        await this.rest.call(`/channels/${id}`, "PATCH", { locked: true, archived: true });
      const overwrites = [...(channel.permission_overwrites ?? [])];
      if (!overwrites.some(p => p.id === connection.workspaceId)) overwrites.push({ id: connection.workspaceId, type: 0, allow: "0", deny: "0" });
      const locked = overwrites.map(p => p.id === this.me ? p : ({ ...p, allow: (BigInt(p.allow) & ~WRITE).toString(), deny: (BigInt(p.deny) | WRITE).toString() }));
      await this.rest.call(`/channels/${channel.id}`, "PATCH", { parent_id: connection.archiveCategoryId, permission_overwrites: locked });
      return { id: channel.id };
    }
    let firstId: string | null = null;
    const pieces = splitChatText(op.text);
    for (let index = 0; index < pieces.length; index++) {
      const marker = `[actio:${operation.id}:${index}]`;
      const found = await this.findMessage(channel.id, marker, operation.createdAt);
      if (found) { firstId ??= found; continue; }
      if (operation.state !== "queued") throw new ChatError("投稿結果が不明です。配送記録を確認してください", 503);
      const sent = await this.rest.call<{ id: string }>(`/channels/${channel.id}/messages`, "POST", {
        content: `${pieces[index]}\n\n${marker}`, allowed_mentions: { parse: [] },
      });
      firstId ??= sent.id;
    }
    if (!firstId) throw new ChatError("投稿IDを取得できません", 503);
    return { id: firstId };
  }
}
