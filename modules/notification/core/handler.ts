import { v4 as uuidv4 } from "uuid";
import {
  notificationPreferenceRepo,
  notificationRepo,
  webhookEndpointRepo,
} from "../../../src/db/repository.js";
import { eventBus } from "./event-bus.js";
import { deliverWebhook, retryWebhookDelivery } from "../channels/webhook/delivery.js";
import { EVENT_NAMES } from "../../../src/shared/constants.js";
import type { WebhookPayload } from "../../../src/shared/types.js";

// ─── Notification Templates ─────────────────────────────────

const TEMPLATES: Record<string, { title: string; body: string }> = {
  [EVENT_NAMES.RESERVATION_CREATED]: {
    title: "「{title}」が予約されました",
    body: "{day} {period}限 - {room}",
  },
  [EVENT_NAMES.RESERVATION_UPDATED]: {
    title: "予約「{title}」が変更されました",
    body: "変更内容: {day} {period}限 - {room}",
  },
  [EVENT_NAMES.RESERVATION_CANCELLED]: {
    title: "予約「{title}」がキャンセルされました",
    body: "{day} {period}限 の予約がキャンセルされました",
  },
  [EVENT_NAMES.RESERVATION_REMINDER]: {
    title: "【リマインド】{title} - {day} {period}限",
    body: "まもなく開始: {room} にて {minutes}分後",
  },
  [EVENT_NAMES.SCHEDULE_CONFIRMED]: {
    title: "新学期時間割が確定しました",
    body: "時間割が確定されました。確認してください。",
  },
  [EVENT_NAMES.SCHEDULE_CHANGED]: {
    title: "授業予定が変更されました",
    body: "{major} - {day} {period}限 ({changeType})",
  },
  [EVENT_NAMES.SYNC_CONFLICT]: {
    title: "予定が競合しています",
    body: "{day} {period}限: {conflictDetails}",
  },
};

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function renderTemplate(
  template: { title: string; body: string },
  vars: Record<string, unknown>
): { title: string; body: string } {
  let title = template.title;
  let body = template.body;

  for (const [key, value] of Object.entries(vars)) {
    const strVal = key === "day" ? (DAY_LABELS[Number(value)] || String(value)) : String(value ?? "");
    title = title.replace(`{${key}}`, strVal);
    body = body.replace(`{${key}}`, strVal);
  }

  return { title, body };
}

/**
 * Initialize the notification handler.
 * Subscribes to all events and routes to appropriate channels.
 */
export function initNotificationHandler(): void {
  // Subscribe to all events
  eventBus.subscribe("*", async (payload: WebhookPayload) => {
    await handleEvent(payload);
  });
}

/**
 * Handle an event: create in-app notifications and dispatch webhooks.
 */
async function handleEvent(payload: WebhookPayload): Promise<void> {
  const { event, data } = payload;

  // 1. Find target users based on event type
  const targetUserIds = getTargetUsers(event, data);

  // 2. Create in-app notifications
  const template = TEMPLATES[event];
  if (template) {
    const rendered = renderTemplate(template, data as Record<string, unknown>);

    for (const userId of targetUserIds) {
      // Check user notification preferences
      const pref = await notificationPreferenceRepo.findByUserAndChannel(userId, "in_app");

      // If no preferences or enabled events include this event
      const shouldNotify =
        !pref ||
        (pref.enabledEvents as string[]).includes(event) ||
        (pref.enabledEvents as string[]).length === 0;

      if (shouldNotify) {
        // Check quiet hours
        if (!isQuietHours(pref?.quietHoursStart ?? null, pref?.quietHoursEnd ?? null)) {
          await notificationRepo.create({
            id: uuidv4(),
            userId,
            event,
            channel: "in_app",
            title: rendered.title,
            body: rendered.body,
          });
        }
      }
    }
  }

  // 3. Dispatch to registered webhooks
  const activeWebhooks = await webhookEndpointRepo.findActive();

  for (const webhook of activeWebhooks) {
    const subscribedEvents = webhook.events as string[];
    if (subscribedEvents.includes(event) || subscribedEvents.includes("*")) {
      const result = await deliverWebhook(
        webhook.id,
        webhook.url,
        webhook.secret,
        payload
      );

      if (!result.success) {
        await retryWebhookDelivery(
          webhook.id,
          webhook.url,
          webhook.secret,
          payload,
          1
        );
      }
    }
  }
}

/**
 * Determine target users for a given event.
 */
function getTargetUsers(
  event: string,
  data: Record<string, unknown>
): string[] {
  switch (event) {
    case EVENT_NAMES.RESERVATION_CREATED:
    case EVENT_NAMES.RESERVATION_UPDATED:
    case EVENT_NAMES.RESERVATION_CANCELLED:
    case EVENT_NAMES.RESERVATION_REMINDER:
      return (data.participants as string[]) || [];

    case EVENT_NAMES.SYNC_CONFLICT:
      return data.userId ? [data.userId as string] : [];

    case EVENT_NAMES.SCHEDULE_CONFIRMED:
    case EVENT_NAMES.SCHEDULE_CHANGED:
      // All students in the affected major - simplified to empty here
      // In production, query users by major
      return [];

    default:
      return [];
  }
}

/**
 * Check if current time is within quiet hours.
 */
function isQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight quiet hours (e.g., 22:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Emit an event to the event bus.
 */
export async function emitEvent(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    deliveryId: uuidv4(),
    data,
  };

  await eventBus.publish(payload);
}
