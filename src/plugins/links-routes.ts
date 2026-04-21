/**
 * Issue #111 D3 — Issue Link REST API
 *
 * 予定 / タスク同士を link_type で関連付ける CRUD.
 *
 *   GET    /api/links/:type/:id            指定 target の全リンク
 *   POST   /api/links                      { fromType, fromId, toType, toId, linkType }
 *   DELETE /api/links/:id
 */

import { Hono } from "hono";
import { z } from "zod";

import { getUserId } from "../middleware/getUserId.js";
import { issueLinkRepo } from "./extensions-repo.js";

const TargetTypeSchema = z.enum(["event", "task"]);
const LinkTypeSchema = z.enum(["blocks", "blocked_by", "relates_to", "duplicates"]);

const CreateBody = z.object({
  fromType: TargetTypeSchema,
  fromId:   z.string().min(1),
  toType:   TargetTypeSchema,
  toId:     z.string().min(1),
  linkType: LinkTypeSchema,
});

export const issueLinkRoutes = new Hono();

issueLinkRoutes.get("/:type/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const type = TargetTypeSchema.safeParse(c.req.param("type"));
  if (!type.success) return c.json({ error: "invalid type" }, 400);
  const id = c.req.param("id");
  const { outgoing, incoming } = await issueLinkRepo.listForTarget(type.data, id);
  return c.json({ outgoing, incoming });
});

issueLinkRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);

  const { fromType, fromId, toType, toId, linkType } = parsed.data;
  if (fromType === toType && fromId === toId) {
    return c.json({ error: "self-link not allowed" }, 400);
  }

  // 既に同じ向きで存在するなら冪等に OK.
  const exists = await issueLinkRepo.exists(fromType, fromId, toType, toId, linkType);
  if (exists) return c.json({ ok: true, deduped: true });

  const id = await issueLinkRepo.create({ fromType, fromId, toType, toId, linkType, createdBy: userId });

  // 双方向 mirror: blocks ↔ blocked_by を自動補完.
  const inverse = linkType === "blocks" ? "blocked_by" : linkType === "blocked_by" ? "blocks" : null;
  if (inverse) {
    const mirror = await issueLinkRepo.exists(toType, toId, fromType, fromId, inverse);
    if (!mirror) {
      await issueLinkRepo.create({
        fromType: toType, fromId: toId,
        toType: fromType, toId: fromId,
        linkType: inverse,
        createdBy: userId,
      });
    }
  }

  return c.json({ ok: true, id });
});

issueLinkRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const deleted = await issueLinkRepo.delete(c.req.param("id"));
  if (!deleted) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
