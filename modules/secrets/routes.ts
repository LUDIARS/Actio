/**
 * シークレット管理 API (管理者専用)
 *
 * Infisical 連携のステータス確認、シークレットの閲覧・作成・更新・削除を提供。
 * Infisical 未設定時は読み取り専用のステータス情報のみ返す。
 */

import { Hono } from "hono";
import { requireRole } from "../../src/middleware/auth.js";
import { secretManager, type SecretScope } from "../../src/config/secrets.js";

const secretsRoutes = new Hono();

// ─── GET /status - Infisical 接続ステータス ──────────────────

secretsRoutes.get("/status", requireRole("admin"), (c) => {
  return c.json({
    infisicalEnabled: secretManager.isInfisicalEnabled(),
    cachedSecretCount: secretManager.listKeys().length,
  });
});

// ─── GET /keys - キャッシュされたシークレットキー一覧 ─────────
// 値は返さない (セキュリティ)

secretsRoutes.get("/keys", requireRole("admin"), (c) => {
  const keys = secretManager.listKeys();
  return c.json({ keys });
});

// ─── GET /value/:key - 特定のシークレットの値を取得 ──────────

secretsRoutes.get("/value/:key", requireRole("admin"), (c) => {
  if (!secretManager.isInfisicalEnabled()) {
    return c.json(
      { error: "Infisical が設定されていません。環境変数を直接確認してください。" },
      400
    );
  }

  const key = c.req.param("key");
  const value = secretManager.get(key);
  if (value === undefined) {
    return c.json({ error: `シークレット "${key}" が見つかりません` }, 404);
  }

  // マスクされた値 (先頭4文字 + ****) を返す
  const masked =
    value.length > 4 ? value.slice(0, 4) + "****" : "****";

  return c.json({ key, masked, length: value.length });
});

// ─── POST /refresh - 手動リフレッシュ ────────────────────────

secretsRoutes.post("/refresh", requireRole("admin"), async (c) => {
  if (!secretManager.isInfisicalEnabled()) {
    return c.json(
      { error: "Infisical が設定されていません" },
      400
    );
  }

  await secretManager.refresh();
  return c.json({
    message: "シークレットをリフレッシュしました",
    cachedSecretCount: secretManager.listKeys().length,
  });
});

// ─── PUT /:key - シークレットの作成/更新 ─────────────────────

secretsRoutes.put("/:key", requireRole("admin"), async (c) => {
  if (!secretManager.isInfisicalEnabled()) {
    return c.json(
      { error: "Infisical が設定されていません" },
      400
    );
  }

  const key = c.req.param("key");
  const body = await c.req.json<{ value: string; scope?: SecretScope }>();

  if (!body.value && body.value !== "") {
    return c.json({ error: "value は必須です" }, 400);
  }

  const scope: SecretScope = body.scope === "personal" ? "personal" : "shared";

  try {
    await secretManager.setSecret(key, body.value, scope);
    return c.json({
      message: `シークレット "${key}" を保存しました`,
      scope,
    });
  } catch (err) {
    console.error("[secrets:api] setSecret error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "シークレットの保存に失敗しました" },
      500
    );
  }
});

// ─── DELETE /:key - シークレットの削除 ───────────────────────

secretsRoutes.delete("/:key", requireRole("admin"), async (c) => {
  if (!secretManager.isInfisicalEnabled()) {
    return c.json(
      { error: "Infisical が設定されていません" },
      400
    );
  }

  const key = c.req.param("key");
  const scope: SecretScope =
    (c.req.query("scope") as SecretScope) === "personal"
      ? "personal"
      : "shared";

  try {
    await secretManager.deleteSecret(key, scope);
    return c.json({ message: `シークレット "${key}" を削除しました` });
  } catch (err) {
    console.error("[secrets:api] deleteSecret error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "シークレットの削除に失敗しました" },
      500
    );
  }
});

export { secretsRoutes };
