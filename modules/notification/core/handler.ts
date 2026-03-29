import { v4 as uuidv4 } from "uuid";
import {
  notificationPreferenceRepo,
  notificationRepo,
  webhookEndpointRepo,
} from "../../../src/db/repository.js";
import { eventBus } from "./event-bus.js";
import { retryWebhookDelivery } from "../channels/webhook/delivery.js";
import { dispatchToPlatform } from "../channels/platform-dispatcher.js";
import { renderNotificationTemplate } from "./template-engine.js";
import { EVENT_NAMES } from "../../../src/shared/constants.js";
import type { WebhookPayload } from "../../../src/shared/types.js";

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
 * Handle an event: create in-app notifications and dispatch to platforms.
 */
async function handleEvent(payload: WebhookPayload): Promise<void> {
  const { event, data } = payload;

  // 1. Find target users based on event type
  const targetUserIds = getTargetUsers(event, data);

  // 2. Create in-app notifications using template engine
  const inAppRendered = await renderNotificationTemplate(
    event,
    "generic",
    data as Record<string, unknown>
  );

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
          title: inAppRendered.title,
          body: inAppRendered.body,
        });
      }
    }
  }

  // 3. Dispatch to registered webhook endpoints (all platforms)
  const activeEndpoints = await webhookEndpointRepo.findActive();

  for (const endpoint of activeEndpoints) {
    const subscribedEvents = endpoint.events as string[];
    if (subscribedEvents.includes(event) || subscribedEvents.includes("*")) {
      // Render template for this specific platform
      const rendered = await renderNotificationTemplate(
        event,
        endpoint.platform ?? "generic",
        data as Record<string, unknown>
      );

      const result = await dispatchToPlatform(endpoint, payload, rendered);

      if (!result.success && endpoint.platform === "generic") {
        // Retry only for generic webhooks (platform-specific retries are handled differently)
        await retryWebhookDelivery(
          endpoint.id,
          endpoint.url,
          endpoint.secret,
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

    case EVENT_NAMES.REMINDER_MORNING:
      return data.userId ? [data.userId as string] : [];

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
