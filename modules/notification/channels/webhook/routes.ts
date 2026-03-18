import { Hono } from "hono";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  webhookEndpointRepo,
  webhookDeliveryLogRepo,
} from "../../../../src/db/repository.js";
import { deliverWebhook } from "./delivery.js";
import type { WebhookPayload } from "../../../../src/shared/types.js";
import { getUserId } from "../../../../src/middleware/getUserId.js";

const webhookRoutes = new Hono();

// ─── POST /webhooks ─────────────────────────────────────────
webhookRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    url: string;
    events: string[];
  }>();
  const createdBy = getUserId(c) || "anonymous";

  const secret = randomBytes(32).toString("hex");

  const webhook = await webhookEndpointRepo.create({
    id: uuidv4(),
    url: body.url,
    events: body.events,
    secret,
    createdBy,
  });

  return c.json(
    {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // Only returned on creation
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

  // Don't expose secrets in listing
  return c.json({
    webhooks: webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
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
    isActive?: boolean;
  }>();

  const current = await webhookEndpointRepo.findById(id);

  if (!current) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const updated = await webhookEndpointRepo.update(id, {
    url: body.url ?? current.url,
    events: body.events ?? current.events,
    isActive: body.isActive ?? current.isActive,
  });

  return c.json({
    id: updated!.id,
    url: updated!.url,
    events: updated!.events,
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
