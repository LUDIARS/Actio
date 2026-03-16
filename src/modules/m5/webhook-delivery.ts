import { createHmac } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../db/connection.js";
import { eq } from "drizzle-orm";
import { WEBHOOK_RETRY_DELAYS, WEBHOOK_MAX_FAILURES } from "../../shared/constants.js";
import type { WebhookPayload } from "../../shared/types.js";

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Deliver a webhook payload to a registered endpoint.
 * Handles retries with exponential backoff.
 */
export async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<{ success: boolean; statusCode: number | null; latencyMs: number }> {
  const deliveryId = payload.deliveryId;
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Delivery-Id": deliveryId,
        "X-Event": payload.event,
        "X-Timestamp": payload.timestamp,
      },
      body,
      signal: AbortSignal.timeout(30_000), // 30s timeout
    });

    const latencyMs = Date.now() - startTime;
    const success = response.ok;

    // Log delivery
    await db.insert(schema.webhookDeliveryLogs).values({
      webhookId,
      deliveryId,
      event: payload.event,
      statusCode: response.status,
      success,
      retryCount: 0,
      latencyMs,
    });

    if (success) {
      // Reset fail count
      await db
        .update(schema.webhookEndpoints)
        .set({ failCount: 0, lastDeliveredAt: new Date() })
        .where(eq(schema.webhookEndpoints.id, webhookId));
    }

    return { success, statusCode: response.status, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    await db.insert(schema.webhookDeliveryLogs).values({
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
 * Retry a failed webhook delivery with exponential backoff.
 * In production, this would be handled by BullMQ.
 */
export async function retryWebhookDelivery(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  retryCount: number = 0
): Promise<void> {
  if (retryCount >= WEBHOOK_RETRY_DELAYS.length) {
    // Max retries exceeded: auto-disable webhook
    await db
      .update(schema.webhookEndpoints)
      .set({ isActive: false })
      .where(eq(schema.webhookEndpoints.id, webhookId));

    console.error(
      `Webhook ${webhookId} auto-disabled after ${WEBHOOK_MAX_FAILURES} failures`
    );
    return;
  }

  const delay = WEBHOOK_RETRY_DELAYS[retryCount];

  // Schedule retry (simplified - in production use BullMQ)
  setTimeout(async () => {
    const body = JSON.stringify(payload);
    const signature = signPayload(body, secret);
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Delivery-Id": payload.deliveryId,
          "X-Event": payload.event,
          "X-Timestamp": payload.timestamp,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });

      const latencyMs = Date.now() - startTime;

      await db.insert(schema.webhookDeliveryLogs).values({
        webhookId,
        deliveryId: payload.deliveryId,
        event: payload.event,
        statusCode: response.status,
        success: response.ok,
        retryCount: retryCount + 1,
        latencyMs,
      });

      if (response.ok) {
        await db
          .update(schema.webhookEndpoints)
          .set({ failCount: 0, lastDeliveredAt: new Date() })
          .where(eq(schema.webhookEndpoints.id, webhookId));
      } else {
        // Increment fail count and retry
        await db
          .update(schema.webhookEndpoints)
          .set({ failCount: retryCount + 1 })
          .where(eq(schema.webhookEndpoints.id, webhookId));

        await retryWebhookDelivery(
          webhookId,
          url,
          secret,
          payload,
          retryCount + 1
        );
      }
    } catch {
      await db
        .update(schema.webhookEndpoints)
        .set({ failCount: retryCount + 1 })
        .where(eq(schema.webhookEndpoints.id, webhookId));

      await retryWebhookDelivery(
        webhookId,
        url,
        secret,
        payload,
        retryCount + 1
      );
    }
  }, delay);
}
