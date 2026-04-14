import { Hono } from "hono";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  webhookEndpointRepo,
  webhookDeliveryLogRepo,
} from "../../../../src/db/repository.js";
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

// ─── POST /webhooks/:id/test (廃止) ─────────────────────────
// 配信は Nuntius 側で実行される。Schedula 側のテスト配信は提供しない。
webhookRoutes.post("/:id/test", (c) => {
  return c.json({
    error: "Webhook test send is no longer supported. Configure delivery via Nuntius topics.",
  }, 501);
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
