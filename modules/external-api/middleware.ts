/**
 * API Key認証ミドルウェア
 *
 * X-API-Client-ID / X-API-Client-Secret ヘッダーによる認証。
 * 外部APIアクセス用。
 */

import { createMiddleware } from "hono/factory";
import bcrypt from "bcryptjs";
import { apiClientRepo } from "../../src/db/repository.js";

type ApiScope = "calendar" | "reminders" | "schedules";

/**
 * APIキー認証ミドルウェア
 * 必要なスコープを指定して使用する。
 */
export function requireApiKey(...requiredScopes: ApiScope[]) {
  return createMiddleware(async (c, next) => {
    const clientId = c.req.header("X-API-Client-ID");
    const clientSecret = c.req.header("X-API-Client-Secret");

    if (!clientId || !clientSecret) {
      return c.json(
        {
          error: "Authentication required",
          message: "X-API-Client-ID and X-API-Client-Secret headers are required",
        },
        401
      );
    }

    const client = await apiClientRepo.findByClientId(clientId);

    if (!client) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    if (!client.isActive) {
      return c.json({ error: "API client is disabled" }, 403);
    }

    const secretValid = await bcrypt.compare(clientSecret, client.clientSecretHash);
    if (!secretValid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // スコープチェック
    const clientScopes = client.scopes as string[];
    for (const scope of requiredScopes) {
      if (!clientScopes.includes(scope)) {
        return c.json(
          {
            error: "Insufficient scope",
            message: `Required scope: ${scope}`,
            requiredScopes,
            grantedScopes: clientScopes,
          },
          403
        );
      }
    }

    // コンテキストにユーザ情報をセット
    c.set("userId" as never, client.userId as never);
    c.set("userRole" as never, "general" as never);
    c.set("apiClientId" as never, client.id as never);

    // 最終使用日時を非同期更新 (レスポンスをブロックしない)
    apiClientRepo.updateLastUsed(client.id).catch(() => {});

    await next();
  });
}
