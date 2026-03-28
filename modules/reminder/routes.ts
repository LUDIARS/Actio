/**
 * リマインダー コアモジュール
 *
 * エンドポイント:
 *   GET    /             — 自分のリマインダー一覧
 *   POST   /             — 構造化データで作成
 *   POST   /parse        — 自由テキストをパースして作成
 *   PUT    /:id          — 更新
 *   DELETE /:id          — 削除
 *   PATCH  /:id/done     — 完了マーク
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getUserId } from "../../src/middleware/getUserId.js";
import { reminderRepo } from "../../src/db/repository.js";
import { parseReminderText } from "./text-parser.js";

export const reminderRoutes = new Hono();

// ─── 一覧取得 ───────────────────────────────────────────────
reminderRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const status = c.req.query("status"); // optional filter: pending / done / cancelled
  let reminders;
  if (status === "pending") {
    reminders = await reminderRepo.findPending(userId);
  } else {
    reminders = await reminderRepo.findByUserId(userId);
  }
  return c.json({ reminders });
});

// ─── 構造化データで作成 ──────────────────────────────────────
reminderRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = await c.req.json() as {
    title?: string;
    description?: string;
    remindAt?: string;
    repeatRule?: string;
  };

  if (!body.title || !body.remindAt) {
    return c.json({ error: "title と remindAt は必須です" }, 400);
  }

  // ISO 8601 形式の簡易バリデーション
  const remindDate = new Date(body.remindAt);
  if (isNaN(remindDate.getTime())) {
    return c.json({ error: "remindAt が無効な日時形式です" }, 400);
  }

  const validRepeatRules = ["none", "daily", "weekly", "monthly", "yearly"];
  const repeatRule = body.repeatRule || "none";
  if (!validRepeatRules.includes(repeatRule)) {
    return c.json({ error: `repeatRule は ${validRepeatRules.join(", ")} のいずれかです` }, 400);
  }

  const reminder = await reminderRepo.create({
    id: randomUUID(),
    userId,
    title: body.title,
    description: body.description || null,
    remindAt: remindDate.toISOString(),
    repeatRule,
    status: "pending",
    source: "api",
  });

  return c.json({ reminder }, 201);
});

// ─── 自由テキストをパースして作成 ─────────────────────────────
reminderRoutes.post("/parse", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = await c.req.json() as { text?: string; source?: string };

  if (!body.text || body.text.trim() === "") {
    return c.json({ error: "text は必須です" }, 400);
  }

  const parsed = parseReminderText(body.text.trim());

  const reminder = await reminderRepo.create({
    id: randomUUID(),
    userId,
    title: parsed.title,
    remindAt: parsed.remindAt,
    repeatRule: "none",
    status: "pending",
    source: body.source || "web",
    originalText: body.text.trim(),
  });

  return c.json({
    reminder,
    parsed: {
      title: parsed.title,
      remindAt: parsed.remindAt,
      confidence: parsed.confidence,
    },
  }, 201);
});

// ─── 更新 ───────────────────────────────────────────────────
reminderRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const id = c.req.param("id");
  const existing = await reminderRepo.findById(id);

  if (!existing) {
    return c.json({ error: "リマインダーが見つかりません" }, 404);
  }
  if (existing.userId !== userId) {
    return c.json({ error: "権限がありません" }, 403);
  }

  const body = await c.req.json() as {
    title?: string;
    description?: string;
    remindAt?: string;
    repeatRule?: string;
    status?: string;
  };

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.remindAt !== undefined) {
    const d = new Date(body.remindAt);
    if (isNaN(d.getTime())) return c.json({ error: "remindAt が無効です" }, 400);
    updateData.remindAt = d.toISOString();
  }
  if (body.repeatRule !== undefined) updateData.repeatRule = body.repeatRule;
  if (body.status !== undefined) {
    const validStatuses = ["pending", "done", "cancelled"];
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: `status は ${validStatuses.join(", ")} のいずれかです` }, 400);
    }
    updateData.status = body.status;
  }

  const updated = await reminderRepo.update(id, updateData);
  return c.json({ reminder: updated });
});

// ─── 削除 ───────────────────────────────────────────────────
reminderRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const id = c.req.param("id");
  const existing = await reminderRepo.findById(id);

  if (!existing) {
    return c.json({ error: "リマインダーが見つかりません" }, 404);
  }
  if (existing.userId !== userId) {
    return c.json({ error: "権限がありません" }, 403);
  }

  await reminderRepo.deleteById(id);
  return c.json({ deleted: id });
});

// ─── 完了マーク ─────────────────────────────────────────────
reminderRoutes.patch("/:id/done", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const id = c.req.param("id");
  const existing = await reminderRepo.findById(id);

  if (!existing) {
    return c.json({ error: "リマインダーが見つかりません" }, 404);
  }
  if (existing.userId !== userId) {
    return c.json({ error: "権限がありません" }, 403);
  }

  const updated = await reminderRepo.update(id, { status: "done" });
  return c.json({ reminder: updated });
});
