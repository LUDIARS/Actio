// @implements AT-SPRINT-CHAT-INTEGRATION
import { secretManager } from "../../../src/config/secrets.js";
import { ChatError, type Connection, type Transport } from "./contracts.js";
import { DiscordRest } from "./discord-rest.js";
import { DiscordTransport } from "./discord-transport.js";
import { ConcordiaChatTransport } from "./concordia-transport.js";
import { ConfiguredIntakeReviewer, type IntakeReviewer } from "./reviewer.js";
import { ConcordiaRequest } from "./concordia-request.js";
import { SlackTransport } from "./slack-transport.js";

export function chatMode(): "concordia" | "discord" {
  const configured = secretManager.get("ACTIO_CHAT_MODE");
  if (configured && configured !== "concordia" && configured !== "discord") throw new ChatError("ACTIO_CHAT_MODE が不正です", 503);
  if (configured === "concordia" || configured === "discord") return configured;
  return secretManager.get("CONCORDIA_URL") ? "concordia" : "discord";
}
export function chatProviders(connection: Connection, signal: AbortSignal): { transport: Transport; reviewer: IntakeReviewer } {
  if (chatMode() === "concordia") {
    const base = secretManager.getRequired("CONCORDIA_URL"), key = secretManager.getRequired("ACTIO_CHAT_SHARED_SECRET");
    const proxy = new ConcordiaRequest(base, key, connection, signal);
    const transport = connection.platform === "discord" ? new DiscordTransport(new DiscordRest("cc-owned", signal, proxy.discordFetch)) : new SlackTransport(proxy);
    return { transport, reviewer: new ConcordiaChatTransport(base, key, signal) };
  }
  if (connection.platform !== "discord") throw new ChatError("Ccなしの配備ではDiscord Botを登録してください", 400);
  if (!connection.tokenRef) throw new ChatError("Discord Botのシークレット参照を設定してください", 400);
  const transport = new DiscordTransport(new DiscordRest(secretManager.getRequired(connection.tokenRef), signal));
  return { transport, reviewer: new ConfiguredIntakeReviewer(key => secretManager.get(key)) };
}
