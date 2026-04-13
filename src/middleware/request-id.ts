/**
 * リクエスト ID middleware
 *
 * - X-Request-Id ヘッダがあれば採用、無ければ UUID 生成
 * - c.set("requestId") にセット、レスポンスにも X-Request-Id ヘッダで返す
 * - structured logger 用の関数を提供
 */

import { createMiddleware } from "hono/factory";
import { v4 as uuidv4 } from "uuid";

const REQUEST_ID_HEADER = "X-Request-Id";

export function requestId() {
  return createMiddleware(async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const id = incoming && incoming.length > 0 ? incoming : uuidv4();
    c.set("requestId" as never, id as never);
    c.header(REQUEST_ID_HEADER, id);
    await next();
  });
}

/** 現在のリクエスト ID を取得 */
export function getRequestId(c: Parameters<Parameters<typeof createMiddleware>[0]>[0]): string {
  return (c.get("requestId" as never) as string | undefined) ?? "no-request-id";
}

/**
 * 構造化ログユーティリティ — JSON で stdout に出力
 * 例: log.info(c, "user.login", { userId: "..." })
 */
export const log = {
  info(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], event: string, data?: Record<string, unknown>) {
    emit("info", c, event, data);
  },
  warn(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], event: string, data?: Record<string, unknown>) {
    emit("warn", c, event, data);
  },
  error(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], event: string, data?: Record<string, unknown>) {
    emit("error", c, event, data);
  },
};

function emit(
  level: "info" | "warn" | "error",
  c: Parameters<Parameters<typeof createMiddleware>[0]>[0],
  event: string,
  data?: Record<string, unknown>,
): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    requestId: getRequestId(c),
    method: c.req.method,
    path: c.req.path,
    ...(data ?? {}),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
