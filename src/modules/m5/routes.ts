import { Hono } from "hono";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../db/connection.js";
import { eq, and } from "drizzle-orm";
import { deliverWebhook } from "./webhook-delivery.js";
import { signPayload } from "./webhook-delivery.js";
import type { WebhookPayload } from "../../shared/types.js";

const m5 = new Hono();

// ─── POST /api/m5/webhooks ──────────────────────────────────
m5.post("/webhooks", async (c) => {
  const body = await c.req.json<{
    url: string;
    events: string[];
  }>();
  const createdBy = c.req.header("X-User-Id") || "anonymous";

  const secret = randomBytes(32).toString("hex");

  const [webhook] = await db
    .insert(schema.webhookEndpoints)
    .values({
      url: body.url,
      events: body.events,
      secret,
      createdBy,
    })
    .returning();

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

// ─── GET /api/m5/webhooks ───────────────────────────────────
m5.get("/webhooks", async (c) => {
  const createdBy = c.req.header("X-User-Id");

  const webhooks = createdBy
    ? await db
        .select()
        .from(schema.webhookEndpoints)
        .where(eq(schema.webhookEndpoints.createdBy, createdBy))
    : await db.select().from(schema.webhookEndpoints);

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

// ─── PUT /api/m5/webhooks/:id ───────────────────────────────
m5.put("/webhooks/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    url?: string;
    events?: string[];
    isActive?: boolean;
  }>();

  const [current] = await db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, id))
    .limit(1);

  if (!current) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const [updated] = await db
    .update(schema.webhookEndpoints)
    .set({
      url: body.url ?? current.url,
      events: body.events ?? current.events,
      isActive: body.isActive ?? current.isActive,
    })
    .where(eq(schema.webhookEndpoints.id, id))
    .returning();

  return c.json({
    id: updated.id,
    url: updated.url,
    events: updated.events,
    isActive: updated.isActive,
  });
});

// ─── DELETE /api/m5/webhooks/:id ────────────────────────────
m5.delete("/webhooks/:id", async (c) => {
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, id))
    .returning();

  if (!deleted) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json({ message: "Webhook deleted" });
});

// ─── POST /api/m5/webhooks/:id/test ─────────────────────────
m5.post("/webhooks/:id/test", async (c) => {
  const id = c.req.param("id");

  const [webhook] = await db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.id, id))
    .limit(1);

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

// ─── POST /api/m5/webhooks/:id/rotate-secret ────────────────
m5.post("/webhooks/:id/rotate-secret", async (c) => {
  const id = c.req.param("id");

  const newSecret = randomBytes(32).toString("hex");

  const [updated] = await db
    .update(schema.webhookEndpoints)
    .set({ secret: newSecret })
    .where(eq(schema.webhookEndpoints.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json({
    id: updated.id,
    secret: newSecret, // Only returned on rotation
    message: "Secret rotated successfully",
  });
});

// ─── GET /api/m5/webhooks/:id/logs ──────────────────────────
m5.get("/webhooks/:id/logs", async (c) => {
  const id = c.req.param("id");

  const logs = await db
    .select()
    .from(schema.webhookDeliveryLogs)
    .where(eq(schema.webhookDeliveryLogs.webhookId, id));

  return c.json({ logs });
});

// ─── GET /api/m5/notifications/preferences ──────────────────
m5.get("/notifications/preferences", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const prefs = await db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId));

  return c.json({
    userId,
    preferences: prefs.map((p) => ({
      channel: p.channel,
      enabledEvents: p.enabledEvents,
      reminder: {
        dayBefore: p.reminderDayBefore,
        dayBeforeTime: p.reminderDayBeforeTime,
        morningOf: p.reminderMorningOf,
        morningOfTime: p.reminderMorningOfTime,
        before: p.reminderBefore,
        beforeMinutes: p.reminderBeforeMinutes,
      },
      quietHoursStart: p.quietHoursStart,
      quietHoursEnd: p.quietHoursEnd,
    })),
  });
});

// ─── PUT /api/m5/notifications/preferences ──────────────────
m5.put("/notifications/preferences", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const body = await c.req.json<{
    channel: string;
    enabledEvents?: string[];
    reminder?: {
      dayBefore?: boolean;
      dayBeforeTime?: string;
      morningOf?: boolean;
      morningOfTime?: string;
      before?: boolean;
      beforeMinutes?: number;
    };
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }>();

  // Upsert preference
  const existing = await db
    .select()
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.userId, userId),
        eq(schema.notificationPreferences.channel, body.channel)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(schema.notificationPreferences)
      .set({
        enabledEvents: body.enabledEvents ?? existing[0].enabledEvents,
        reminderDayBefore:
          body.reminder?.dayBefore ?? existing[0].reminderDayBefore,
        reminderDayBeforeTime:
          body.reminder?.dayBeforeTime ?? existing[0].reminderDayBeforeTime,
        reminderMorningOf:
          body.reminder?.morningOf ?? existing[0].reminderMorningOf,
        reminderMorningOfTime:
          body.reminder?.morningOfTime ?? existing[0].reminderMorningOfTime,
        reminderBefore:
          body.reminder?.before ?? existing[0].reminderBefore,
        reminderBeforeMinutes:
          body.reminder?.beforeMinutes ?? existing[0].reminderBeforeMinutes,
        quietHoursStart:
          body.quietHoursStart ?? existing[0].quietHoursStart,
        quietHoursEnd: body.quietHoursEnd ?? existing[0].quietHoursEnd,
      })
      .where(eq(schema.notificationPreferences.id, existing[0].id))
      .returning();

    return c.json(updated);
  } else {
    const [created] = await db
      .insert(schema.notificationPreferences)
      .values({
        userId,
        channel: body.channel,
        enabledEvents: body.enabledEvents || [],
        reminderDayBefore: body.reminder?.dayBefore ?? true,
        reminderDayBeforeTime: body.reminder?.dayBeforeTime ?? "18:00",
        reminderMorningOf: body.reminder?.morningOf ?? true,
        reminderMorningOfTime: body.reminder?.morningOfTime ?? "08:00",
        reminderBefore: body.reminder?.before ?? true,
        reminderBeforeMinutes: body.reminder?.beforeMinutes ?? 15,
        quietHoursStart: body.quietHoursStart ?? "22:00",
        quietHoursEnd: body.quietHoursEnd ?? "07:00",
      })
      .returning();

    return c.json(created, 201);
  }
});

// ─── GET /api/m5/notifications/history ──────────────────────
m5.get("/notifications/history", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const history = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId));

  return c.json({ notifications: history });
});

// ─── POST /api/m5/notifications/:id/read ────────────────────
m5.post("/notifications/:id/read", async (c) => {
  const id = c.req.param("id");

  const [updated] = await db
    .update(schema.notifications)
    .set({ isRead: true })
    .where(eq(schema.notifications.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Notification not found" }, 404);
  }

  return c.json({ message: "Marked as read" });
});

export { m5 };
