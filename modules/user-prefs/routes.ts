/**
 * User Preferences Module — ログインユーザの個人設定 (汎用 KV)
 *
 * dot-key 形式 (例: "notify.task.self_completion") の自由 KV ストア。
 * 認証されたユーザは自分の preferences のみ読み書きできる。
 *
 * 個人識別情報は載せない (toggle 値・クライアント設定値のみ)。
 * 個人データ非保管ルール対象外。
 */

import { Hono } from "hono";
import { getUserId } from "../../src/middleware/getUserId.js";
import { userPreferenceRepo } from "../../src/db/repository.js";

export const userPrefsRoutes = new Hono();

// dot-key の許容文字: 英数字 + dot + underscore + dash。 値は文字列のみ (自由形式)。
const KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const MAX_KEY_LENGTH = 128;
const MAX_VALUE_LENGTH = 1024;

function validKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    KEY_PATTERN.test(key)
  );
}

// ─── GET /api/user-prefs ──────────────────────────────────
// 認証ユーザの全 preferences を返す ({ key: value } 形式)
userPrefsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const entries = await userPreferenceRepo.listByUser(userId);
  const preferences: Record<string, string> = {};
  for (const e of entries) preferences[e.key] = e.value;
  return c.json({ preferences });
});

// ─── GET /api/user-prefs/:key ─────────────────────────────
userPrefsRoutes.get("/:key", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const key = c.req.param("key");
  if (!validKey(key)) return c.json({ error: "Invalid key" }, 400);

  const value = await userPreferenceRepo.get(userId, key);
  if (value === undefined) return c.json({ key, value: null });
  return c.json({ key, value });
});

// ─── PUT /api/user-prefs ──────────────────────────────────
// body: { preferences: { key: value, ... } } で複数を一括 upsert
userPrefsRoutes.put("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{ preferences?: Record<string, string> }>();
  const prefs = body.preferences;
  if (!prefs || typeof prefs !== "object") {
    return c.json({ error: "preferences object is required" }, 400);
  }

  for (const [key, value] of Object.entries(prefs)) {
    if (!validKey(key)) {
      return c.json({ error: `Invalid key: ${key}` }, 400);
    }
    if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
      return c.json({ error: `Invalid value for ${key}` }, 400);
    }
  }

  for (const [key, value] of Object.entries(prefs)) {
    await userPreferenceRepo.upsert(userId, key, value);
  }

  const entries = await userPreferenceRepo.listByUser(userId);
  const preferences: Record<string, string> = {};
  for (const e of entries) preferences[e.key] = e.value;
  return c.json({ preferences });
});

// ─── DELETE /api/user-prefs/:key ──────────────────────────
userPrefsRoutes.delete("/:key", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const key = c.req.param("key");
  if (!validKey(key)) return c.json({ error: "Invalid key" }, 400);

  await userPreferenceRepo.delete(userId, key);
  return c.json({ ok: true });
});
