import { v4 as uuidv4 } from "uuid";
import {
  webhookEndpointRepo,
  webhookDeliveryLogRepo,
} from "../../../../src/db/repository.js";
import type { WebhookPayload } from "../../../../src/shared/types.js";
import { signPayload } from "../webhook/delivery.js";

/**
 * Format a payload as a Discord message.
 */
function formatDiscordPayload(
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean,
  codeBlockLang: string | null
): Record<string, unknown> {
  const content = useCodeBlock
    ? `**${title}**\n\`\`\`${codeBlockLang || ""}\n${body}\n\`\`\``
    : undefined;

  return {
    content: useCodeBlock ? content : undefined,
    embeds: useCodeBlock
      ? undefined
      : [
          {
            title,
            description: body,
            color: 5814783, // Blue
            footer: {
              text: `Event: ${payload.event} | ${payload.timestamp}`,
            },
          },
        ],
  };
}

/**
 * Deliver via Discord Webhook.
 */
export async function deliverDiscordWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean,
  codeBlockLang: string | null
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const discordPayload = formatDiscordPayload(payload, title, body, useCodeBlock, codeBlockLang);
  const jsonBody = JSON.stringify(discordPayload);
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signPayload(jsonBody, secret),
        "X-Delivery-Id": deliveryId,
      },
      body: jsonBody,
      signal: AbortSignal.timeout(30_000),
    });

    const latencyMs = Date.now() - startTime;
    // Discord returns 204 No Content on success
    const success = response.ok || response.status === 204;

    await webhookDeliveryLogRepo.create({
      id: uuidv4(),
      webhookId,
      deliveryId,
      event: payload.event,
      statusCode: response.status,
      success,
      retryCount: 0,
      latencyMs,
    });

    if (success) {
      await webhookEndpointRepo.update(webhookId, {
        failCount: 0,
        lastDeliveredAt: new Date(),
      });
    }

    return { success, statusCode: response.status, latencyMs };
  } catch {
    const latencyMs = Date.now() - startTime;

    await webhookDeliveryLogRepo.create({
      id: uuidv4(),
      webhookId,
      deliveryId,
      event: payload.event,
      statusCode: null,
      success: false,
      retryCount: 0,
      latencyMs,
    });

    return { success: false, statusCode: null, latencyMs };
  }
}

/**
 * Deliver via Discord Bot API.
 */
export async function deliverDiscordBot(
  webhookId: string,
  botToken: string,
  channelId: string,
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean,
  codeBlockLang: string | null
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const discordPayload = formatDiscordPayload(payload, title, body, useCodeBlock, codeBlockLang);
  const jsonBody = JSON.stringify(discordPayload);
  const startTime = Date.now();

  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${botToken}`,
        },
        body: jsonBody,
        signal: AbortSignal.timeout(30_000),
      }
    );

    const latencyMs = Date.now() - startTime;
    const success = response.ok;

    await webhookDeliveryLogRepo.create({
      id: uuidv4(),
      webhookId,
      deliveryId,
      event: payload.event,
      statusCode: response.status,
      success,
      retryCount: 0,
      latencyMs,
    });

    if (success) {
      await webhookEndpointRepo.update(webhookId, {
        failCount: 0,
        lastDeliveredAt: new Date(),
      });
    }

    return { success, statusCode: response.status, latencyMs };
  } catch {
    const latencyMs = Date.now() - startTime;

    await webhookDeliveryLogRepo.create({
      id: uuidv4(),
      webhookId,
      deliveryId,
      event: payload.event,
      statusCode: null,
      success: false,
      retryCount: 0,
      latencyMs,
    });

    return { success: false, statusCode: null, latencyMs };
  }
}
