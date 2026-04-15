import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import {
  notificationPreferenceRepo,
  notificationRepo,
  notificationTemplateRepo,
  userRepo,
} from "../../src/db/repository.js";
import { webhookRoutes } from "./channels/webhook/routes.js";
import { renderNotificationTemplate } from "./core/template-engine.js";
import { getUserId, getUserRole } from "../../src/middleware/getUserId.js";
import { logActivity } from "../../src/activity-logger.js";

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

    const user = await userRepo.findById(userId);
    logActivity(userId, user?.name || "Unknown", "通知設定更新", `通知チャネル「${body.channel}」の設定が更新されました`);

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

    const user = await userRepo.findById(userId);
    logActivity(userId, user?.name || "Unknown", "通知設定作成", `通知チャネル「${body.channel}」の設定が追加されました`);

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

// ─── DELETE /notifications/:id ───────────────────────────────
notification.delete("/notifications/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const id = c.req.param("id");
  const notif = await notificationRepo.findById(id);

  if (!notif) {
    return c.json({ error: "Notification not found" }, 404);
  }

  const role = getUserRole(c);
  if (notif.userId !== userId && role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  await notificationRepo.deleteById(id);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "通知削除", `通知「${notif.title}」を削除しました`);

  return c.json({ message: "Notification deleted" });
});

// morning-reminder エンドポイントは削除 (Nuntius 移行予定)

// ─── Template CRUD Routes ───────────────────────────────────

// GET /templates — list all templates
notification.get("/templates", async (c) => {
  const templates = await notificationTemplateRepo.findAll();
  return c.json({ templates });
});

// GET /templates/:id — get single template
notification.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const template = await notificationTemplateRepo.findById(id);

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  return c.json({ template });
});

// POST /templates — create template
notification.post("/templates", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const body = await c.req.json<{
    event: string;
    platform?: string;
    title: string;
    body: string;
    useCodeBlock?: boolean;
    codeBlockLang?: string;
  }>();

  const template = await notificationTemplateRepo.create({
    id: uuidv4(),
    event: body.event,
    platform: body.platform || "all",
    title: body.title,
    body: body.body,
    useCodeBlock: body.useCodeBlock ?? false,
    codeBlockLang: body.codeBlockLang || null,
    isDefault: false,
    createdBy: userId,
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "テンプレート作成", `通知テンプレート「${body.event}」を作成しました`);

  return c.json({ template }, 201);
});

// PUT /templates/:id — update template
notification.put("/templates/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const id = c.req.param("id");
  const existing = await notificationTemplateRepo.findById(id);

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  const body = await c.req.json<{
    event?: string;
    platform?: string;
    title?: string;
    body?: string;
    useCodeBlock?: boolean;
    codeBlockLang?: string;
  }>();

  const updated = await notificationTemplateRepo.update(id, {
    event: body.event ?? existing.event,
    platform: body.platform ?? existing.platform,
    title: body.title ?? existing.title,
    body: body.body ?? existing.body,
    useCodeBlock: body.useCodeBlock ?? existing.useCodeBlock,
    codeBlockLang: body.codeBlockLang !== undefined ? body.codeBlockLang : existing.codeBlockLang,
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "テンプレート更新", `通知テンプレート「${updated!.event}」を更新しました`);

  return c.json({ template: updated });
});

// DELETE /templates/:id — delete template
notification.delete("/templates/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "X-User-Id header required" }, 400);
  }

  const id = c.req.param("id");
  const existing = await notificationTemplateRepo.findById(id);

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  if (existing.isDefault) {
    return c.json({ error: "Cannot delete default template" }, 400);
  }

  await notificationTemplateRepo.deleteById(id);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "テンプレート削除", `通知テンプレート「${existing.event}」を削除しました`);

  return c.json({ message: "Template deleted" });
});

// POST /templates/preview — preview template rendering
notification.post("/templates/preview", async (c) => {
  const body = await c.req.json<{
    event: string;
    platform?: string;
    sampleData?: Record<string, unknown>;
  }>();

  const sampleData = body.sampleData || {
    title: "テスト予約",
    day: 0,
    period: 1,
    room: "A101",
    major: "情報工学",
    changeType: "変更",
    minutes: 15,
    conflictDetails: "同一時間帯に2件の予定",
    message: "テスト送信メッセージ",
  };

  const rendered = await renderNotificationTemplate(
    body.event,
    body.platform || "generic",
    sampleData
  );

  return c.json({ rendered });
});

// ─── POST /test-send (廃止) ──────────────────────────────────
// 配信は Nuntius が担当する。Actio 側のテスト配信は提供しない。
notification.post("/test-send", (c) => {
  return c.json({
    error: "test-send is no longer supported. Configure delivery via Nuntius topics.",
  }, 501);
});

export { notification };
