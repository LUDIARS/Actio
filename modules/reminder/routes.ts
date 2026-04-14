/**
 * リマインダー コアモジュール (Nuntius 完全移行版)
 *
 * 配信は LUDIARS Nuntius サービスに完全委譲する。
 * Schedula 側の reminders テーブルへの新規 INSERT は行わない。
 *
 * エンドポイント:
 *   GET    /             — 過去の (移行前) リマインダー閲覧 (legacy / 読み取り専用)
 *   POST   /             — 構造化データで Nuntius に登録
 *   POST   /parse        — 自由テキストをパースして Nuntius に登録
 *   DELETE /:id          — Nuntius 側で配信キャンセル
 *   PUT    /:id          — 廃止 (501): Nuntius は cancel + reschedule パターン
 *   PATCH  /:id/done     — 廃止 (501): Nuntius は配信完了で自動的にステータス更新
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getUserId } from "../../src/middleware/getUserId.js";
import { reminderRepo } from "../../src/db/repository.js";
import { parseReminderText } from "./text-parser.js";
import { nuntiusClient } from "../../src/lib/nuntius-client.js";

export const reminderRoutes = new Hono();

function ensureNuntius(): { ok: true } | { ok: false; status: 503; body: { error: string } } {
  if (!nuntiusClient.isConfigured()) {
    return { ok: false, status: 503, body: { error: "Nuntius is not configured" } };
  }
  return { ok: true };
}

// ─── 一覧取得 (legacy) ──────────────────────────────────────
// 移行前にローカル DB に登録された pending リマインダーを参照する用。
// 新規登録は Nuntius にのみ行われるため、新規分はここに現れない。
reminderRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const status = c.req.query("status");
  const reminders = status === "pending"
    ? await reminderRepo.findPending(userId)
    : await reminderRepo.findByUserId(userId);
  return c.json({ reminders });
});

// ─── 構造化データで作成 ──────────────────────────────────────
reminderRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const ready = ensureNuntius();
  if (!ready.ok) return c.json(ready.body, ready.status);

  const body = await c.req.json() as {
    title?: string;
    description?: string;
    remindAt?: string;
    repeatRule?: string;
    channel?: "slack" | "discord" | "line" | "webhook" | "email" | "voice" | "alexa" | "sms";
  };

  if (!body.title || !body.remindAt) {
    return c.json({ error: "title と remindAt は必須です" }, 400);
  }

  const remindDate = new Date(body.remindAt);
  if (isNaN(remindDate.getTime())) {
    return c.json({ error: "remindAt が無効な日時形式です" }, 400);
  }

  const validRepeatRules = ["none", "daily", "weekly", "monthly", "yearly"];
  const repeatRule = body.repeatRule || "none";
  if (!validRepeatRules.includes(repeatRule)) {
    return c.json({ error: `repeatRule は ${validRepeatRules.join(", ")} のいずれかです` }, 400);
  }

  const id = randomUUID();
  const result = await nuntiusClient.schedule({
    userId,
    channel: body.channel ?? "webhook",
    sendAt: remindDate.toISOString(),
    payload: {
      title: body.title,
      description: body.description ?? "",
    },
    source: "schedula.reminder",
    idempotencyKey: id,
    recurrenceRule: repeatRule === "none" ? undefined : repeatRule,
  });

  return c.json({
    reminder: {
      id: result.id,
      userId,
      title: body.title,
      description: body.description ?? null,
      remindAt: remindDate.toISOString(),
      repeatRule,
      status: result.status,
      source: "api",
    },
  }, 201);
});

// ─── 自由テキストをパースして作成 ─────────────────────────────
reminderRoutes.post("/parse", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const ready = ensureNuntius();
  if (!ready.ok) return c.json(ready.body, ready.status);

  const body = await c.req.json() as { text?: string; source?: string };
  if (!body.text || body.text.trim() === "") {
    return c.json({ error: "text は必須です" }, 400);
  }

  const parsed = parseReminderText(body.text.trim());
  const id = randomUUID();
  const result = await nuntiusClient.schedule({
    userId,
    channel: "webhook",
    sendAt: parsed.remindAt,
    payload: {
      title: parsed.title,
      originalText: body.text.trim(),
    },
    source: body.source || "schedula.reminder.parse",
    idempotencyKey: id,
  });

  return c.json({
    reminder: {
      id: result.id,
      userId,
      title: parsed.title,
      remindAt: parsed.remindAt,
      repeatRule: "none",
      status: result.status,
      source: body.source || "web",
      originalText: body.text.trim(),
    },
    parsed: {
      title: parsed.title,
      remindAt: parsed.remindAt,
      confidence: parsed.confidence,
    },
  }, 201);
});

// ─── 更新 (廃止) ────────────────────────────────────────────
reminderRoutes.put("/:id", (c) => {
  return c.json({
    error: "Reminder update is no longer supported. Cancel and reschedule via Nuntius instead.",
  }, 501);
});

// ─── 削除 (Nuntius cancel) ──────────────────────────────────
reminderRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const ready = ensureNuntius();
  if (!ready.ok) return c.json(ready.body, ready.status);

  const id = c.req.param("id");
  try {
    const result = await nuntiusClient.cancel(id);
    return c.json({ deleted: result.id, status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) return c.json({ error: "リマインダーが見つかりません" }, 404);
    throw err;
  }
});

// ─── 完了マーク (廃止) ─────────────────────────────────────
reminderRoutes.patch("/:id/done", (c) => {
  return c.json({
    error: "Manual completion is no longer supported. Nuntius marks status automatically on dispatch.",
  }, 501);
});
