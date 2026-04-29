/**
 * Placement Module — Hono routes.
 *
 * Two auth modes:
 *   - User-facing endpoints (places / hooks / current): Cernere JWT via getUserId(c)
 *   - Ingestion endpoint (POST /locations): pre-shared service key in
 *     X-Placement-Service-Key header (env: PLACEMENT_SERVICE_KEY)。
 *     body の user_id を信頼 (Imperativus が Cernere user id を渡す前提)。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { secretManager } from "../../src/config/secrets.js";
import {
  placeRepo,
  placementStateRepo,
  placeVisitRepo,
  placeHookRepo,
} from "./repo.js";
import { findCurrentPlace, diffTransitions } from "./engine.js";
import { fireHook } from "./forwarder.js";

export const placementRoutes = new Hono();

// ─── POST /api/placement/locations (Iv → Actio ingestion) ──
// body: { user_id, lat, lon, accuracy?, ts?, device_id? }
placementRoutes.post("/locations", async (c) => {
  const expected = secretManager.get("PLACEMENT_SERVICE_KEY") ?? "";
  if (expected) {
    const provided = c.req.header("X-Placement-Service-Key") ?? "";
    if (provided !== expected) {
      return c.json({ error: "service-key auth failed" }, 401);
    }
  }

  let body: {
    user_id?: string;
    lat?: number;
    lon?: number;
    accuracy?: number;
    ts?: string;
    device_id?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const userId = body.user_id;
  const lat = body.lat;
  const lon = body.lon;
  if (!userId || typeof lat !== "number" || typeof lon !== "number") {
    return c.json({ error: "user_id / lat / lon required" }, 400);
  }

  const seenAt = body.ts ? new Date(body.ts) : new Date();
  if (isNaN(seenAt.getTime())) {
    return c.json({ error: "invalid ts" }, 400);
  }

  // 1) 全 place を取得 → 現在 place を判定
  const places = await placeRepo.listForUser(userId);
  const current = findCurrentPlace(lat, lon, places);
  const currentId = current?.id ?? null;

  // 2) 過去 state と比較
  const prev = await placementStateRepo.get(userId);
  const prevId = prev?.currentPlaceId ?? null;
  const transitions = diffTransitions(prevId, currentId);

  // 3) state を更新
  await placementStateRepo.upsert({
    userId,
    currentPlaceId: currentId,
    lat,
    lon,
    seenAt,
  });

  // 4) transition があれば place_visits 更新 + hook 発火
  for (const t of transitions) {
    if (t.type === "leave") {
      await placeVisitRepo.closeOpenVisit(userId, t.placeId, seenAt);
    } else {
      await placeVisitRepo.startVisit({
        id: uuidv4(),
        userId,
        placeId: t.placeId,
        enteredAt: seenAt,
      });
    }
    // hook を fire-and-forget (response をブロックしない)
    void (async () => {
      const hooks = await placeHookRepo.listForPlace(t.placeId, t.type);
      for (const hook of hooks) {
        if (hook.userId !== userId) continue; // safety: 他人の hook は発火しない
        const result = await fireHook({
          hookId: hook.id,
          userId: hook.userId,
          placeId: hook.placeId,
          event: hook.event,
          actionType: hook.actionType,
          actionConfig: hook.actionConfig,
          ts: seenAt,
        });
        if (!result.ok) {
          console.warn(
            `[placement] hook ${hook.id} failed: ${result.error ?? `status=${result.status}`}`,
          );
        }
      }
    })();
  }

  return c.json({
    ok: true,
    currentPlaceId: currentId,
    transitions,
  });
});

// ─── GET /api/placement/places (own places) ────────────────
placementRoutes.get("/places", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const places = await placeRepo.listForUser(userId);
  return c.json({ places });
});

// ─── POST /api/placement/places ────────────────────────────
// body: { name, lat, lon, radius_m? }
//   lat/lon を省略すると placement_state の last_lat/last_lon を使う (現在地)
placementRoutes.post("/places", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  let body: { name?: string; lat?: number; lon?: number; radius_m?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  let lat = body.lat;
  let lon = body.lon;
  if (typeof lat !== "number" || typeof lon !== "number") {
    const state = await placementStateRepo.get(userId);
    if (!state || state.lastLat === null || state.lastLon === null) {
      return c.json(
        {
          error:
            "lat/lon を省略する場合は placement_state に last_lat/last_lon が必要 (Imperativus からの位置受信が一度必要)",
        },
        400,
      );
    }
    lat = state.lastLat;
    lon = state.lastLon;
  }

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: "name required" }, 400);
  }
  const radiusM = typeof body.radius_m === "number" ? Math.max(1, body.radius_m | 0) : 100;

  const place = await placeRepo.create({
    id: uuidv4(),
    userId,
    name: body.name.trim(),
    lat,
    lon,
    radiusM,
  });
  return c.json({ place }, 201);
});

// ─── DELETE /api/placement/places/:id ──────────────────────
placementRoutes.delete("/places/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const id = c.req.param("id");
  const existing = await placeRepo.findById(id);
  if (!existing || existing.userId !== userId) {
    return c.json({ error: "not found" }, 404);
  }
  await placeRepo.remove(id, userId);
  return c.body(null, 204);
});

// ─── GET /api/placement/current ────────────────────────────
placementRoutes.get("/current", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const state = await placementStateRepo.get(userId);
  if (!state) return c.json({ state: null });
  let currentPlace = null;
  if (state.currentPlaceId) {
    currentPlace = await placeRepo.findById(state.currentPlaceId);
  }
  return c.json({
    state: {
      lastLat: state.lastLat,
      lastLon: state.lastLon,
      lastSeenAt: state.lastSeenAt,
      currentPlace,
    },
  });
});

// ─── Hooks ─────────────────────────────────────────────────

placementRoutes.get("/places/:id/hooks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const placeId = c.req.param("id");
  const place = await placeRepo.findById(placeId);
  if (!place || place.userId !== userId) {
    return c.json({ error: "place not found" }, 404);
  }
  const all = await placeHookRepo.listForUser(userId);
  return c.json({ hooks: all.filter((h) => h.placeId === placeId) });
});

placementRoutes.post("/places/:id/hooks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const placeId = c.req.param("id");
  const place = await placeRepo.findById(placeId);
  if (!place || place.userId !== userId) {
    return c.json({ error: "place not found" }, 404);
  }
  let body: {
    event?: "enter" | "leave";
    action_type?: string;
    action_config?: Record<string, unknown>;
    enabled?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  if (body.event !== "enter" && body.event !== "leave") {
    return c.json({ error: "event must be 'enter' or 'leave'" }, 400);
  }
  if (!body.action_type) {
    return c.json({ error: "action_type required" }, 400);
  }
  const hookId = uuidv4();
  await placeHookRepo.create({
    id: hookId,
    userId,
    placeId,
    event: body.event,
    actionType: body.action_type,
    actionConfig: body.action_config ?? {},
    enabled: body.enabled ?? true,
  });
  return c.json({ hook: { id: hookId, placeId, event: body.event } }, 201);
});

placementRoutes.patch("/places/:id/hooks/:hookId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const hookId = c.req.param("hookId");
  let body: {
    event?: "enter" | "leave";
    action_type?: string;
    action_config?: Record<string, unknown>;
    enabled?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  await placeHookRepo.update(hookId, userId, {
    event: body.event,
    actionType: body.action_type,
    actionConfig: body.action_config,
    enabled: body.enabled,
  });
  return c.json({ ok: true });
});

placementRoutes.delete("/places/:id/hooks/:hookId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const hookId = c.req.param("hookId");
  await placeHookRepo.remove(hookId, userId);
  return c.body(null, 204);
});
