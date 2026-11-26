// @spec スクラムマスターの役割と権限
import { createMiddleware } from "hono/factory";
import { SCRUM_MASTER_HEADER } from "./contracts.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PHASE_BASE = /^\/api\/teams\/[^/]+\/planning\/sprints\/[^/]+\/phase\//;

export function isPhaseWrite(method: string, path: string): boolean {
  const base = PHASE_BASE.exec(path);
  if (!base) return false;
  const operation = path.slice(base[0].length);
  return (method === "PUT" && operation === "context") || (method === "POST" && operation === "decisions");
}

/**
 * スクラムマスターを名乗る要求の書き込みをフェーズ操作に限る。
 * タスクの完了や役割の付け外しは、この役割の権限に含まれない。
 */
export function scrumMasterBoundary() {
  return createMiddleware(async (c, next) => {
    if (c.req.header(SCRUM_MASTER_HEADER) !== undefined
      && !READ_METHODS.has(c.req.method) && !isPhaseWrite(c.req.method, c.req.path)) {
      return c.json({ error: "スクラムマスター役はスプリントのフェーズ操作だけを実行できます" }, 403);
    }
    await next();
  });
}
