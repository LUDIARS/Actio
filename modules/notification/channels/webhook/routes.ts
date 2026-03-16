import { Hono } from "hono";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../../../src/db/connection.js";
import { eq } from "drizzle-orm";
import { deliverWebhook, signPayload } from "./delivery.js";
import type { WebhookPayload } from "../../../../src/shared/types.js";

const webhookRoutes = new Hono();

// ─── POST /webhooks ─────────────────────────────────────────
webhookRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    url: string;
    events: string[];
  }>();
  const createdBy = c.req.header("X-User-Id") || "anonymous";

  const secret = randomBytes(32).toString("hex");

  const [webhook] = db
    .insert(schema.webhookEndpoints)
    .values({
      id: uuidv4(),
      url: body.url,
      events: body.events,
      secret,
      createdBy,
    })
    .returning().all();

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
  const createdBy = c.req.header("X-User-Id");

  const webhooks = createdBy
    ? db
        .select()
        .from(schema.webhookEndpoints)
        .where(eq(schema.webhookEndpoints.createdBy, createdBy))
        .all()
    : db.select().from(schema.webhookEndpoints).all();

  // Don't expose secrets in listing
  return c.json({
    webhooks: webhooks.map((w: any) => ({
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

  const [current] = db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, id))
    .limit(1)
    .all();

  if (!current) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const [updated] = db
    .update(schema.webhookEndpoints)
    .set({
      url: body.url ?? current.url,
      events: body.events ?? current.events,
      isActive: body.isActive ?? current.isActive,
    })
    .where(eq(schema.webhookEndpoints.id, id))
    .returning().all();

  return c.json({
    id: updated.id,
    url: updated.url,
    events: updated.events,
    isActive: updated.isActive,
  });
});

// ─── DELETE /webhooks/:id ───────────────────────────────────
webhookRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const [deleted] = db
    .delete(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, id))
    .returning().all();

  if (!deleted) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json({ message: "Webhook deleted" });
});

// ─── POST /webhooks/:id/test ────────────────────────────────
webhookRoutes.post("/:id/test", async (c) => {
  const id = c.req.param("id");

  const [webhook] = db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, id))
    .limit(1)
    .all();

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

  const [updated] = db
    .update(schema.webhookEndpoints)
    .set({ secret: newSecret })
    .where(eq(schema.webhookEndpoints.id, id))
    .returning().all();

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

  const logs = db
    .select()
    .from(schema.webhookDeliveryLogs)
    .where(eq(schema.webhookDeliveryLogs.webhookId, id))
    .all();

  return c.json({ logs });
});

export { webhookRoutes };
