import type { WebhookPayload } from "../../../src/shared/types.js";

type EventHandler = (payload: WebhookPayload) => void | Promise<void>;

/**
 * In-memory event bus (Redis Pub/Sub replacement for development).
 * In production, replace with Redis Pub/Sub or similar.
 */
class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  /**
   * Subscribe to an event.
   */
  subscribe(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  /**
   * Unsubscribe a handler from an event.
   */
  unsubscribe(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    this.handlers.set(
      event,
      existing.filter((h) => h !== handler)
    );
  }

  /**
   * Publish an event to all subscribers.
   */
  async publish(payload: WebhookPayload): Promise<void> {
    const handlers = this.handlers.get(payload.event) || [];
    const wildcardHandlers = this.handlers.get("*") || [];

    const allHandlers = [...handlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      try {
        await handler(payload);
      } catch (error) {
        console.error(
          `Event handler error for ${payload.event}:`,
          error
        );
      }
    }
  }
}

// Singleton event bus
export const eventBus = new EventBus();
