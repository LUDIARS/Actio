import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";
import { webhookRoutes } from "./channels/webhook/routes.js";

const notification = new Hono();

// ─── Webhook Channel Routes ─────────────────────────────────
notification.route("/webhooks", webhookRoutes);

// ─── GET /notifications/preferences ─────────────────────────
notification.get("/notifications/preferences", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const prefs = db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId))
    .all();

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

// ─── PUT /notifications/preferences ─────────────────────────
notification.put("/notifications/preferences", async (c) => {
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
  const existing = db
    .select()
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.userId, userId),
        eq(schema.notificationPreferences.channel, body.channel)
      )
    )
    .limit(1)
    .all();

  if (existing.length > 0) {
    const [updated] = db
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
      .returning().all();

    return c.json(updated);
  } else {
    const [created] = db
      .insert(schema.notificationPreferences)
      .values({
        id: uuidv4(),
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
      .returning().all();

    return c.json(created, 201);
  }
});

// ─── GET /notifications/history ─────────────────────────────
notification.get("/notifications/history", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const history = db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .all();

  return c.json({ notifications: history });
});

// ─── POST /notifications/:id/read ───────────────────────────
notification.post("/notifications/:id/read", async (c) => {
  const id = c.req.param("id");

  const [updated] = db
    .update(schema.notifications)
    .set({ isRead: true })
    .where(eq(schema.notifications.id, id))
    .returning().all();

  if (!updated) {
    return c.json({ error: "Notification not found" }, 404);
  }

  return c.json({ message: "Marked as read" });
});

export { notification };
