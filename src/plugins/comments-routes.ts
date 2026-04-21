/**
 * Issue #111 D4 — Comments / Activity Stream REST API
 *
 *   GET    /api/comments/:type/:id         指定 target の全コメント
 *   POST   /api/comments                   { targetType, targetId, body, replyTo? }
 *   PATCH  /api/comments/:id               { body } — author のみ
 *   DELETE /api/comments/:id               author のみ
 *
 * Comment 作成時は `comments.created` event bus topic を emit する
 * (他モジュールが活動フィードを組み立てられるよう D5 と連動).
 */

import { Hono } from "hono";
import { z } from "zod";

import { getUserId } from "../middleware/getUserId.js";
import { commentRepo } from "./extensions-repo.js";
import { pluginEventBus } from "./event-bus.js";

const TargetTypeSchema = z.enum(["event", "task"]);

const CreateBody = z.object({
  targetType: TargetTypeSchema,
  targetId:   z.string().min(1),
  body:       z.string().min(1).max(10_000),
  replyTo:    z.string().min(1).optional(),
});

const UpdateBody = z.object({
  body: z.string().min(1).max(10_000),
});

export const commentRoutes = new Hono();

commentRoutes.get("/:type/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const type = TargetTypeSchema.safeParse(c.req.param("type"));
  if (!type.success) return c.json({ error: "invalid type" }, 400);
  const rows = await commentRepo.listForTarget(type.data, c.req.param("id"));
  return c.json({ comments: rows });
});

commentRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const parsed = CreateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);

  const id = await commentRepo.create({
    targetType: parsed.data.targetType,
    targetId:   parsed.data.targetId,
    authorId:   userId,
    body:       parsed.data.body,
    replyTo:    parsed.data.replyTo ?? null,
  });

  // fan-out (non-blocking).
  void pluginEventBus.emit(
    "comments.created",
    {
      id,
      targetType: parsed.data.targetType,
      targetId:   parsed.data.targetId,
      authorId:   userId,
      body:       parsed.data.body,
    },
    "comments",
  );

  return c.json({ ok: true, id });
});

commentRoutes.patch("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const parsed = UpdateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);

  const ok = await commentRepo.update(c.req.param("id"), userId, parsed.data.body);
  if (!ok) return c.json({ error: "not found or not author" }, 404);
  return c.json({ ok: true });
});

commentRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const ok = await commentRepo.delete(c.req.param("id"), userId);
  if (!ok) return c.json({ error: "not found or not author" }, 404);
  return c.json({ ok: true });
});
