// @implements AT-SPRINT-CHAT-INTEGRATION
import type { IncomingMessage } from "./contracts.js";
import type { DiscordMessage } from "./discord-rest.js";
import { backlogCommand } from "./triggers.js";

export const COMMAND_RECEIPT = "actio-backlog-command:v1";
/** Links are identifiers, never arbitrary URLs to fetch. */
export function discordTarget(text: string, guild: string): { channelId: string; messageId: string } | null {
  const match = text.trim().match(/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/u);
  if (!match || match[1] !== guild) return null;
  return { channelId: match[2], messageId: match[3] };
}
export function discordIncoming(m: DiscordMessage, guild: string, channel: string, parent: string | null, botId: string): IncomingMessage {
  const bot = !!m.author.bot || !!m.webhook_id;
  const receipt = m.author.id === botId && m.application_id === botId
    && (m.interaction_metadata?.type ?? m.interaction?.type) === 2
    ? m.embeds?.find(e => e.footer?.text === COMMAND_RECEIPT) : undefined;
  let command: string | null = receipt?.description ?? null;
  if (!bot) {
    const mention = m.content.trimStart().match(/^<@!?(\d+)>\s*(?:バックログ(?:追加)?)(?=$|\s|[：:])[:：]?\s*([\s\S]*)$/u);
    command = mention && mention[1] === botId ? mention[2].trim() : backlogCommand(m.content);
  }
  let request: IncomingMessage["intakeRequest"];
  if (command !== null) {
    request = { text: command };
    if (/^https?:\/\//u.test(command)) {
      const target = discordTarget(command, guild);
      if (target) request = { text: "", target };
      else request.error = "同じDiscordサーバーのメッセージリンクを1件指定してください。";
    } else if (m.message_reference?.message_id) {
      const ref = m.message_reference;
      if (ref.guild_id && ref.guild_id !== guild) request.error = "別サーバーの投稿は指定できません。";
      else request.target = { channelId: ref.channel_id ?? channel, messageId: ref.message_id! };
    }
  }
  return { id: m.id, channelId: channel, parentId: parent, content: m.content,
    externalActorId: bot ? null : m.author.id, bot, deleted: false,
    occurredAt: m.timestamp, editedAt: m.edited_timestamp,
    url: `https://discord.com/channels/${guild}/${channel}/${m.id}`,
    attachments: m.attachments.map(a => ({ name: a.filename, url: a.url })),
    ...(request ? { intakeRequest: request } : {}) };
}
