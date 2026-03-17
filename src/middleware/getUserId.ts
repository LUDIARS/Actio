import type { Context } from "hono";

/**
 * ミドルウェアが設定したユーザーIDを取得（JWT認証優先、ヘッダーフォールバック）
 *
 * userContext() ミドルウェアが JWT から抽出した userId を優先し、
 * フォールバックとして X-User-Id ヘッダーを参照する。
 */
export function getUserId(c: Context): string | null {
  const ctxId = c.get("userId" as never) as string | undefined;
  if (ctxId && ctxId !== "anonymous") return ctxId;
  return c.req.header("X-User-Id") || null;
}
