import { v4 as uuidv4 } from "uuid";
import {
  webhookEndpointRepo,
  webhookDeliveryLogRepo,
} from "../../../../src/db/repository.js";
import type { WebhookPayload } from "../../../../src/shared/types.js";
import { signPayload } from "../webhook/delivery.js";

/**
 * Format a payload as a Slack message.
 * Supports both Webhook (Incoming Webhook URL) and Bot (chat.postMessage API).
 */
function formatSlackPayload(
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean
): Record<string, unknown> {
  const text = useCodeBlock ? `*${title}*\n\`\`\`\n${body}\n\`\`\`` : `*${title}*\n${body}`;
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Event: \`${payload.event}\` | ${payload.timestamp}`,
          },
        ],
      },
    ],
  };
}

/**
 * Deliver via Slack Incoming Webhook.
 */
export async function deliverSlackWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const slackPayload = formatSlackPayload(payload, title, body, useCodeBlock);
  const jsonBody = JSON.stringify(slackPayload);
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

/**
 * Deliver via Slack Bot API (chat.postMessage).
 */
export async function deliverSlackBot(
  webhookId: string,
  botToken: string,
  channelId: string,
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const slackPayload = {
    channel: channelId,
    ...formatSlackPayload(payload, title, body, useCodeBlock),
  };
  const jsonBody = JSON.stringify(slackPayload);
  const startTime = Date.now();

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${botToken}`,
      },
      body: jsonBody,
      signal: AbortSignal.timeout(30_000),
    });

    const latencyMs = Date.now() - startTime;
    const result = await response.json() as { ok: boolean };
    const success = response.ok && result.ok;

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
