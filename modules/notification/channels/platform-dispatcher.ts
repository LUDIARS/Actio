import type { WebhookPayload } from "../../../src/shared/types.js";
import type { WebhookEndpoint } from "../../../src/db/repository.js";
import { deliverWebhook } from "./webhook/delivery.js";
import { deliverSlackWebhook, deliverSlackBot } from "./slack/delivery.js";
import { deliverDiscordWebhook, deliverDiscordBot } from "./discord/delivery.js";
import { deliverLineWebhook, deliverLineBot } from "./line/delivery.js";
import type { RenderedTemplate } from "../core/template-engine.js";

export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  latencyMs: number;
}

/**
 * Dispatch a notification to the appropriate platform delivery handler.
 */
export async function dispatchToPlatform(
  endpoint: WebhookEndpoint,
  payload: WebhookPayload,
  rendered: RenderedTemplate
): Promise<DeliveryResult> {
  const { platform, sendMethod, url, secret, botToken, channelId, id: webhookId } = endpoint;

  switch (platform) {
    case "slack":
      if (sendMethod === "bot" && botToken && channelId) {
        return deliverSlackBot(
          webhookId, botToken, channelId, payload,
          rendered.title, rendered.body, rendered.useCodeBlock
        );
      }
      return deliverSlackWebhook(
        webhookId, url, secret, payload,
        rendered.title, rendered.body, rendered.useCodeBlock
      );

    case "discord":
      if (sendMethod === "bot" && botToken && channelId) {
        return deliverDiscordBot(
          webhookId, botToken, channelId, payload,
          rendered.title, rendered.body, rendered.useCodeBlock, rendered.codeBlockLang
        );
      }
      return deliverDiscordWebhook(
        webhookId, url, secret, payload,
        rendered.title, rendered.body, rendered.useCodeBlock, rendered.codeBlockLang
      );

    case "line":
      if (sendMethod === "bot" && botToken && channelId) {
        return deliverLineBot(
          webhookId, botToken, channelId, payload,
          rendered.title, rendered.body, rendered.useCodeBlock
        );
      }
      return deliverLineWebhook(
        webhookId, url, secret, payload,
        rendered.title, rendered.body, rendered.useCodeBlock
      );

    case "generic":
    default:
      return deliverWebhook(webhookId, url, secret, payload);
  }
}
