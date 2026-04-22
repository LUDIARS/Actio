/**
 * Issue #111 D1 — Custom Fields REST API
 *
 *   GET  /api/custom-fields/definitions           全モジュールの宣言一覧
 *   GET  /api/custom-fields/:type/:id             target に紐づく値群
 *   PUT  /api/custom-fields/:moduleId/:fieldId/:type/:id   値の upsert
 *   DELETE 同パス                                   値削除
 */

import { Hono } from "hono";
import { z } from "zod";

import { getUserId } from "../middleware/getUserId.js";
import { customFieldRegistry } from "./custom-fields.js";
import { customFieldValueRepo } from "./extensions-repo.js";

const TargetTypeSchema = z.enum(["event", "task"]);

export const customFieldRoutes = new Hono();

customFieldRoutes.get("/definitions", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  return c.json({ fields: customFieldRegistry.listAll() });
});

customFieldRoutes.get("/:type/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const type = TargetTypeSchema.safeParse(c.req.param("type"));
  if (!type.success) return c.json({ error: "invalid type" }, 400);
  const rows = await customFieldValueRepo.listForTarget(type.data, c.req.param("id"));
  return c.json({ values: rows });
});

customFieldRoutes.put("/:moduleId/:fieldId/:type/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const type = TargetTypeSchema.safeParse(c.req.param("type"));
  if (!type.success) return c.json({ error: "invalid type" }, 400);

  const moduleId = c.req.param("moduleId");
  const fieldId  = c.req.param("fieldId");
  const body = await c.req.json().catch(() => null) as { value?: unknown } | null;
  if (!body || !("value" in body)) {
    return c.json({ error: "body must contain 'value'" }, 400);
  }

  try {
    customFieldRegistry.validate(moduleId, fieldId, type.data, body.value);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  await customFieldValueRepo.upsert({
    moduleId, fieldId,
    targetType: type.data, targetId: c.req.param("id"),
    value: body.value,
  });
  return c.json({ ok: true });
});

customFieldRoutes.delete("/:moduleId/:fieldId/:type/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const type = TargetTypeSchema.safeParse(c.req.param("type"));
  if (!type.success) return c.json({ error: "invalid type" }, 400);
  const ok = await customFieldValueRepo.delete(
    c.req.param("moduleId"),
    c.req.param("fieldId"),
    type.data,
    c.req.param("id"),
  );
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
