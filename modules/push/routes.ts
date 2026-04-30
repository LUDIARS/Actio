/**
 * /api/push — WebPush 購読管理 (Nuntius へのプロキシ)
 *
 * Actio frontend が直接 Nuntius を叩けないため (CORS / 認証コンテキスト
 * の違い)、 Actio backend が認証済 userId を付けて Nuntius にプロキシする。
 *
 * - VAPID 公開鍵: `GET /api/push/vapid-public-key` (認証不要)
 * - 購読登録   : `POST /api/push/subscriptions`
 * - 一覧       : `GET /api/push/subscriptions`
 * - 解除       : `DELETE /api/push/subscriptions/:id`
 *
 * Nuntius が未構成なら 503 を返す (NUNTIUS_URL / project credentials 未設定)。
 */

import { Hono } from "hono";
import { getUserId } from "../../src/middleware/getUserId.js";
import { nuntiusClient } from "../../src/lib/nuntius-client.js";

export const pushRoutes = new Hono();

pushRoutes.get("/vapid-public-key", async (c) => {
  if (!nuntiusClient.isConfigured()) {
    return c.json({ error: "Nuntius not configured" }, 503);
  }
  try {
    const r = await nuntiusClient.getVapidPublicKey();
    return c.json(r);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

pushRoutes.post("/subscriptions", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  if (!nuntiusClient.isConfigured()) {
    return c.json({ error: "Nuntius not configured" }, 503);
  }

  type Body = {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    label?: string | null;
  };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: "endpoint and keys.{p256dh,auth} are required" }, 400);
  }

  try {
    const r = await nuntiusClient.savePushSubscription({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      label: body.label ?? null,
    });
    return c.json(r);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

pushRoutes.get("/subscriptions", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  if (!nuntiusClient.isConfigured()) {
    return c.json({ items: [] });
  }
  try {
    const r = await nuntiusClient.listPushSubscriptions(userId);
    return c.json(r);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

pushRoutes.delete("/subscriptions/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  if (!nuntiusClient.isConfigured()) {
    return c.json({ error: "Nuntius not configured" }, 503);
  }
  const id = c.req.param("id");
  try {
    const r = await nuntiusClient.deletePushSubscription(id);
    return c.json(r);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
