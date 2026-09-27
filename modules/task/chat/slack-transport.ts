// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatError, type Connection, type Operation, type Transport, type IncomingMessage } from "./contracts.js";
import { splitChatText } from "./discord-rest.js";
import { ConcordiaRequest } from "./concordia-request.js";
import { slackHistory, splitSlackChannel, type SlackPage } from "./slack-history.js";
interface Channel { id: string; name: string; is_private?: boolean; is_shared?: boolean; is_archived?: boolean; topic?: { value: string } }
export class SlackTransport implements Transport {
  constructor(private readonly api: ConcordiaRequest) {}
  close(): void { /* Runtime owns request signals. */ }
  private async channel(id: string): Promise<Channel> {
    const { channel } = await this.api.slack<{ channel: Channel }>("conversations.info", { channel: splitSlackChannel(id).channel });
    if (channel.is_private || channel.is_shared) throw new ChatError("非公開・外部共有SlackチャンネルはWebログの権限対応が必要です", 400);
    return channel;
  }
  async validate(connection: Connection): Promise<void> { await this.channel(connection.backlogChannelId); }
  async threads(_connection: Connection, channelId: string): Promise<string[]> {
    await this.channel(channelId);
    const threads = new Set<string>(); let cursor = "";
    for (let page = 0; page < 100; page++) {
      const result = await this.api.slack<SlackPage>("conversations.history", { channel: channelId, limit: 100, cursor });
      for (const message of result.messages) if (message.reply_count) threads.add(`${channelId}~${message.ts}`);
      cursor = result.response_metadata?.next_cursor ?? "";
      if (!cursor) { if (result.has_more) break; return [...threads]; }
    }
    throw new ChatError("Slackスレッド履歴の取込が完了していません", 503);
  }
  async messages(connection: Connection, channelId: string, cursor: string | null): Promise<{ messages: IncomingMessage[]; cursor: string; complete: boolean }> {
    await this.channel(channelId); return slackHistory(this.api, connection.workspaceId, channelId, cursor);
  }
  async deleted(_connection: Connection, channelId: string, ids: string[]): Promise<string[]> {
    const target = splitSlackChannel(channelId), removed: string[] = [];
    for (const id of ids) {
      const ts = id.split(":")[1];
      const result = await this.api.slack<SlackPage>(target.thread ? "conversations.replies" : "conversations.history", {
        channel: target.channel, ...(target.thread ? { ts: target.thread } : {}), oldest: ts, latest: ts, inclusive: true, limit: 1,
      });
      if (!result.messages.some(m => m.ts === ts)) removed.push(id);
    }
    return removed;
  }
  private async send(channelId: string, operation: Operation, text: string): Promise<string> {
    const target = splitSlackChannel(channelId);
    const me = await this.api.slack<{ user_id: string }>("auth.test", {});
    const pieces = splitChatText(text, 2800); let first = "";
    for (let index = 0; index < pieces.length; index++) {
      const marker = `[actio:${operation.id}:${index}]`;
      let cursor = "", found = "", exhausted = false;
      for (let page = 0; page < 30; page++) {
        const result = await this.api.slack<SlackPage>(target.thread ? "conversations.replies" : "conversations.history", {
          channel: target.channel, ...(target.thread ? { ts: target.thread } : {}), oldest: String(Date.parse(operation.createdAt) / 1000 - 1), limit: 100, cursor,
        });
        found = result.messages.find(m => m.user === me.user_id && m.text?.endsWith(marker))?.ts ?? "";
        cursor = result.response_metadata?.next_cursor ?? "";
        if (found || (!cursor && !result.has_more)) { exhausted = true; break; }
      }
      if (!exhausted) throw new ChatError("Slack配送結果の照合が未完了です", 503);
      if (!found) {
        if (operation.state !== "queued") throw new ChatError("Slackの投稿結果が不明です。再送せず確認を待っています", 503);
        found = (await this.api.slack<{ ts: string }>("chat.postMessage", { channel: target.channel,
          ...(target.thread ? { thread_ts: target.thread } : {}), text: `${pieces[index]}\n\n${marker}`, mrkdwn: false, unfurl_links: false, unfurl_media: false })).ts;
      }
      first ||= `${target.channel}:${found}`;
    }
    return first;
  }
  async deliver(connection: Connection, operation: Operation): Promise<{ id: string }> {
    const op = operation.payload;
    if (op.kind === "channel") {
      const name = `actio-${operation.id}`;
      let cursor = ""; let matched: Channel | undefined; let complete = false;
      for (let page = 0; page < 100; page++) {
        const result = await this.api.slack<{ channels: Channel[]; response_metadata?: { next_cursor?: string } }>("conversations.list", { limit: 100, cursor, exclude_archived: false, types: "public_channel" });
        matched = result.channels.find(c => c.name === name);
        cursor = result.response_metadata?.next_cursor ?? "";
        if (matched || !cursor) { complete = true; break; }
      }
      if (!complete) throw new ChatError("Slackチャンネルの照合が未完了です", 503);
      if (!matched) {
        if (operation.state !== "queued") throw new ChatError("Slackチャンネル作成結果が不明です", 503);
        matched = (await this.api.slack<{ channel: Channel }>("conversations.create", { name, is_private: false })).channel;
      }
      await this.api.slack("conversations.setTopic", { channel: matched.id, topic: `actio-sprint:${connection.teamId}:${op.sprintId}` });
      return { id: matched.id };
    }
    const channel = await this.channel(op.channelId);
    if (op.kind === "archive") {
      if (channel.topic?.value !== `actio-sprint:${connection.teamId}:${op.sprintId}`) throw new ChatError("Actio管理外のSlackチャンネルです", 400);
      if (!channel.is_archived) await this.api.slack("conversations.archive", { channel: channel.id });
      return { id: channel.id };
    }
    if (op.kind === "thread") {
      const ts = op.messageId.split(":")[1];
      if (!ts) throw new ChatError("Slack親投稿IDが不正です", 400);
      const id = `${channel.id}~${ts}`;
      await this.send(id, operation, "内容確認のスレッドです。補足・回答はここへ投稿してください。");
      return { id };
    }
    return { id: await this.send(op.channelId, operation, op.text) };
  }
}
