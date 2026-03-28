import { v4 as uuidv4 } from "uuid";
import {
  webhookEndpointRepo,
  webhookDeliveryLogRepo,
} from "../../../../src/db/repository.js";
import type { WebhookPayload } from "../../../../src/shared/types.js";
import { signPayload } from "../webhook/delivery.js";

/**
 * Format a payload as a LINE Notify message.
 */
function formatLineNotifyPayload(
  title: string,
  body: string,
  useCodeBlock: boolean
): string {
  return useCodeBlock
    ? `\n${title}\n---\n${body}`
    : `\n${title}\n${body}`;
}

/**
 * Deliver via LINE Notify (Webhook-style).
 * LINE Notify uses application/x-www-form-urlencoded format.
 */
export async function deliverLineWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const message = formatLineNotifyPayload(title, body, useCodeBlock);

  // If url looks like LINE Notify API, use form-urlencoded
  const isLineNotify = url.includes("notify-api.line.me");
  const startTime = Date.now();

  try {
    let response: Response;

    if (isLineNotify) {
      const formBody = new URLSearchParams({ message });
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${secret}`,
        },
        body: formBody.toString(),
        signal: AbortSignal.timeout(30_000),
      });
    } else {
      // Generic webhook-style delivery with LINE format
      const jsonPayload = {
        event: payload.event,
        timestamp: payload.timestamp,
        deliveryId,
        message,
        data: payload.data,
      };
      const jsonBody = JSON.stringify(jsonPayload);
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signPayload(jsonBody, secret),
          "X-Delivery-Id": deliveryId,
        },
        body: jsonBody,
        signal: AbortSignal.timeout(30_000),
      });
    }

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
 * Deliver via LINE Messaging API (Bot).
 */
export async function deliverLineBot(
  webhookId: string,
  botToken: string,
  channelId: string,
  payload: WebhookPayload,
  title: string,
  body: string,
  useCodeBlock: boolean
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const message = formatLineNotifyPayload(title, body, useCodeBlock);

  const linePayload = {
    to: channelId,
    messages: [
      {
        type: "text",
        text: message,
      },
    ],
  };
  const jsonBody = JSON.stringify(linePayload);
  const startTime = Date.now();

  try {
    const response = await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botToken}`,
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
