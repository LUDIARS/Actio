// @implements AT-SPRINT-CHAT-INTEGRATION
import { COMMAND_RECEIPT, discordTarget } from "./discord-intake.js";

export const backlogCommands = [
  { name: "backlog", description: "バックログを追加", type: 1, options: [{ name: "add", description: "本文または元投稿を受付", type: 1, options: [
    { name: "text", description: "追加する内容", type: 3, max_length: 3500 },
    { name: "message", description: "同じ受付チャンネルのメッセージリンク", type: 3 },
  ] }] },
  { name: "バックログに追加", type: 3 },
];
export interface BacklogInteraction {
  type: number; guild_id?: string; channel_id?: string;
  data?: { name: string; type: number; target_id?: string; options?: { name: string; value?: string; options?: { name: string; value?: string }[] }[] };
}
export function backlogInteractionResponse(input: BacklogInteraction): object {
  const data = input.data;
  let text = "", error = "";
  if (data?.name === "バックログに追加" && data.type === 3 && /^\d+$/.test(data.target_id ?? ""))
    text = `https://discord.com/channels/${input.guild_id}/${input.channel_id}/${data.target_id}`;
  else if (data?.name === "backlog" && data.type === 1 && data.options?.[0]?.name === "add") {
    const options = data.options[0].options ?? [];
    const content = options.find(o => o.name === "text")?.value?.trim() ?? "";
    const link = options.find(o => o.name === "message")?.value?.trim() ?? "";
    text = content || link;
    if (!!content === !!link) error = "本文かメッセージリンクをどちらか1つ指定してください。";
    if (link && discordTarget(link, input.guild_id ?? "")?.channelId !== input.channel_id) error = "同じ受付チャンネルのメッセージリンクを指定してください。";
  } else error = "対応していないコマンドです。";
  if (text.length > 3500) error = "本文は3500文字以内で指定してください。";
  return { type: 4, data: error ? { content: error, flags: 64, allowed_mentions: { parse: [] } } : {
    content: "バックログの追加を受け付けました。内容確認用のスレッドに不足事項を投稿します（タスク確定前）。",
    allowed_mentions: { parse: [] }, embeds: [{ description: text, footer: { text: COMMAND_RECEIPT } }],
  } };
}
