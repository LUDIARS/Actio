/**
 * シークレット管理 API (管理者専用)
 *
 * シークレットプロバイダーのステータス確認、シークレットの閲覧を提供。
 * Vault / SSM: 読み取り専用 (書き込みは外部ストアで)
 * プロバイダー未設定時は読み取り専用のステータス情報のみ返す。
 */

import { Hono } from "hono";
import { requireRole } from "../../src/middleware/auth.js";
import { secretManager } from "../../src/config/secrets.js";

const secretsRoutes = new Hono();

// ─── GET /status - プロバイダー接続ステータス ────────────────

secretsRoutes.get("/status", requireRole("admin"), (c) => {
  return c.json({
    infisicalEnabled: false,
    externalProviderEnabled: secretManager.isExternalProviderEnabled(),
    ssmEnabled: secretManager.isSsmEnabled(),
    providerType: secretManager.getProviderType(),
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
  if (!secretManager.isExternalProviderEnabled()) {
    return c.json(
      { error: "外部シークレットプロバイダーが設定されていません。環境変数を直接確認してください。" },
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
  if (!secretManager.isExternalProviderEnabled()) {
    return c.json(
      { error: "外部シークレットプロバイダーが設定されていません" },
      400
    );
  }

  await secretManager.refresh();
  return c.json({
    message: "シークレットをリフレッシュしました",
    cachedSecretCount: secretManager.listKeys().length,
  });
});

// Secret writes belong to the external store, never Actio.
secretsRoutes.put("/:key", requireRole("admin"), (c) => c.json({ error: "secret_writes_removed" }, 410));
secretsRoutes.delete("/:key", requireRole("admin"), (c) => c.json({ error: "secret_writes_removed" }, 410));

export { secretsRoutes };
