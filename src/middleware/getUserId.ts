/**
 * ユーザーID/ロール取得ヘルパー
 *
 * Hono Context から userId / userRole を取得する。
 * @cernere/id-cache ミドルウェアがセットした値を読み取る。
 */

import type { Context } from "hono";

export function getUserId(c: Context): string | null {
  const id = c.get("userId" as never) as string | undefined;
  if (!id || id === "anonymous") return null;
  return id;
}

export function getUserRole(c: Context): string {
  return (c.get("userRole" as never) as string) || "general";
}
