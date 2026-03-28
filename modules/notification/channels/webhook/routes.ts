import { Hono } from "hono";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  webhookEndpointRepo,
  webhookDeliveryLogRepo,
} from "../../../../src/db/repository.js";
import { deliverWebhook } from "./delivery.js";
import { dispatchToPlatform } from "../platform-dispatcher.js";
import { renderNotificationTemplate } from "../../core/template-engine.js";
import type { WebhookPayload } from "../../../../src/shared/types.js";
import { getUserId } from "../../../../src/middleware/getUserId.js";
import type { NotificationPlatform, SendMethod } from "../../../../src/shared/constants.js";

const webhookRoutes = new Hono();

// ─── POST /webhooks ─────────────────────────────────────────
webhookRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    url: string;
    events: string[];
    platform?: NotificationPlatform;
    sendMethod?: SendMethod;
    botToken?: string;
    channelId?: string;
  }>();
  const createdBy = getUserId(c);
  if (!createdBy) return c.json({ error: "Authentication required" }, 401);

  const secret = randomBytes(32).toString("hex");

  const webhook = await webhookEndpointRepo.create({
    id: uuidv4(),
    url: body.url,
    events: body.events,
    secret,
    platform: body.platform || "generic",
    sendMethod: body.sendMethod || "webhook",
    botToken: body.botToken || null,
    channelId: body.channelId || null,
    createdBy,
  });

  return c.json(
    {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // Only returned on creation
      platform: webhook.platform,
      sendMethod: webhook.sendMethod,
      channelId: webhook.channelId,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    },
    201
  );
});

// ─── GET /webhooks ──────────────────────────────────────────
webhookRoutes.get("/", async (c) => {
  const createdBy = getUserId(c);

  const webhooks = createdBy
    ? await webhookEndpointRepo.findByCreatedBy(createdBy)
    : await webhookEndpointRepo.findAll();

  // Don't expose secrets or bot tokens in listing
  return c.json({
    webhooks: webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      platform: w.platform,
      sendMethod: w.sendMethod,
      channelId: w.channelId,
      isActive: w.isActive,
      failCount: w.failCount,
      lastDeliveredAt: w.lastDeliveredAt,
      createdAt: w.createdAt,
    })),
  });
});

// ─── PUT /webhooks/:id ──────────────────────────────────────
webhookRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    url?: string;
    events?: string[];
    platform?: NotificationPlatform;
    sendMethod?: SendMethod;
    botToken?: string;
    channelId?: string;
    isActive?: boolean;
  }>();

  const current = await webhookEndpointRepo.findById(id);

  if (!current) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const updated = await webhookEndpointRepo.update(id, {
    url: body.url ?? current.url,
    events: body.events ?? current.events,
    platform: body.platform ?? current.platform,
    sendMethod: body.sendMethod ?? current.sendMethod,
    botToken: body.botToken !== undefined ? body.botToken : current.botToken,
    channelId: body.channelId !== undefined ? body.channelId : current.channelId,
    isActive: body.isActive ?? current.isActive,
  });

  return c.json({
    id: updated!.id,
    url: updated!.url,
    events: updated!.events,
    platform: updated!.platform,
    sendMethod: updated!.sendMethod,
    channelId: updated!.channelId,
    isActive: updated!.isActive,
  });
});

// ─── DELETE /webhooks/:id ───────────────────────────────────
webhookRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await webhookEndpointRepo.deleteById(id);

  if (!deleted) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json({ message: "Webhook deleted" });
});

// ─── POST /webhooks/:id/test ────────────────────────────────
webhookRoutes.post("/:id/test", async (c) => {
  const id = c.req.param("id");
  const webhook = await webhookEndpointRepo.findById(id);

  if (!webhook) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const testPayload: WebhookPayload = {
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    deliveryId: uuidv4(),
    data: { message: "This is a test delivery" },
  };

  const platform = webhook.platform ?? "generic";

  // Use platform dispatcher for platform-specific endpoints
  if (platform !== "generic") {
    const rendered = await renderNotificationTemplate(
      "webhook.test",
      platform,
      testPayload.data as Record<string, unknown>
    );
    const result = await dispatchToPlatform(webhook, testPayload, rendered);
    return c.json({
      delivered: result.success,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      platform,
    });
  }

  // Generic webhook delivery
  const result = await deliverWebhook(
    webhook.id,
    webhook.url,
    webhook.secret,
    testPayload
  );

  return c.json({
    delivered: result.success,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    platform: "generic",
  });
});

// ─── POST /webhooks/:id/rotate-secret ───────────────────────
webhookRoutes.post("/:id/rotate-secret", async (c) => {
  const id = c.req.param("id");
  const newSecret = randomBytes(32).toString("hex");

  const updated = await webhookEndpointRepo.update(id, { secret: newSecret });

  if (!updated) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json({
    id: updated.id,
    secret: newSecret, // Only returned on rotation
    message: "Secret rotated successfully",
  });
});

// ─── GET /webhooks/:id/logs ─────────────────────────────────
webhookRoutes.get("/:id/logs", async (c) => {
  const id = c.req.param("id");
  const logs = await webhookDeliveryLogRepo.findByWebhookId(id);
  return c.json({ logs });
});

export { webhookRoutes };
