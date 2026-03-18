import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import {
  notificationPreferenceRepo,
  notificationRepo,
} from "../../src/db/repository.js";
import { webhookRoutes } from "./channels/webhook/routes.js";
import { getUserId } from "../../src/middleware/getUserId.js";

const notification = new Hono();

// ─── Webhook Channel Routes ─────────────────────────────────
notification.route("/webhooks", webhookRoutes);

// ─── GET /notifications/preferences ─────────────────────────
notification.get("/notifications/preferences", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const prefs = await notificationPreferenceRepo.findByUserId(userId);

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
  const userId = getUserId(c);
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
  const existing = await notificationPreferenceRepo.findByUserAndChannel(userId, body.channel);

  if (existing) {
    const updated = await notificationPreferenceRepo.update(existing.id, {
      enabledEvents: body.enabledEvents ?? existing.enabledEvents,
      reminderDayBefore:
        body.reminder?.dayBefore ?? existing.reminderDayBefore,
      reminderDayBeforeTime:
        body.reminder?.dayBeforeTime ?? existing.reminderDayBeforeTime,
      reminderMorningOf:
        body.reminder?.morningOf ?? existing.reminderMorningOf,
      reminderMorningOfTime:
        body.reminder?.morningOfTime ?? existing.reminderMorningOfTime,
      reminderBefore:
        body.reminder?.before ?? existing.reminderBefore,
      reminderBeforeMinutes:
        body.reminder?.beforeMinutes ?? existing.reminderBeforeMinutes,
      quietHoursStart:
        body.quietHoursStart ?? existing.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd ?? existing.quietHoursEnd,
    });

    return c.json(updated);
  } else {
    const created = await notificationPreferenceRepo.create({
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
    });

    return c.json(created, 201);
  }
});

// ─── GET /notifications/history ─────────────────────────────
notification.get("/notifications/history", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const history = await notificationRepo.findByUserId(userId);
  return c.json({ notifications: history });
});

// ─── POST /notifications/:id/read ───────────────────────────
notification.post("/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  const updated = await notificationRepo.markAsRead(id);

  if (!updated) {
    return c.json({ error: "Notification not found" }, 404);
  }

  return c.json({ message: "Marked as read" });
});

export { notification };
