/**
 * Cc の「だれの指示か」を操作ログへ残す (spec/feature/cc-acting-for.md, AT-CC-ACTING-FOR)。
 *
 * Concordia はローカル持ち主 (loopback) として書き込むため、持ち主だけでは指示した人が分からない。
 * Concordia が `x-actio-acting-for: <platform>:<userId>` を付けた書き込みについて、
 * 操作ログ (logs/activity.log) にだけ 1 行残す。DB には保存しない (個人データの正本は Cernere)。
 *
 * この PC から直接来た要求 (loopback) 以外の申告は信用せず、記録もしない。
 */
import type { MiddlewareHandler } from "hono";
import { logActivity } from "../activity-logger.js";
import { localAccessKind } from "./local-mode.js";

export const ACTING_FOR_HEADER = "x-actio-acting-for";

export interface ActingFor {
  platform: "discord" | "slack";
  userId: string;
}

const ACTING_FOR = /^(discord|slack):([A-Za-z0-9_-]{1,64})$/;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 形式が正しい申告だけを返す。改行や区切り文字を含む値はログへ入れない。 */
export function parseActingFor(value: string | null | undefined): ActingFor | null {
  const match = ACTING_FOR.exec((value ?? "").trim());
  if (!match) return null;
  return { platform: match[1] as ActingFor["platform"], userId: match[2] };
}

export function actingForLine(method: string, path: string, status: number, actingFor: ActingFor): string {
  return `${method} ${path} status=${status} acting-for=${actingFor.platform}:${actingFor.userId}`;
}

/** loopback の書き込みに付いた申告を、応答後に操作ログへ記録する。記録の失敗は応答に影響させない。 */
export function actingForAudit(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (!WRITE_METHODS.has(c.req.method) || localAccessKind(c) !== "loopback") return;
    const actingFor = parseActingFor(c.req.header(ACTING_FOR_HEADER));
    if (!actingFor) return;
    try {
      logActivity("actio-local", "Concordia", "cc:acting-for", actingForLine(c.req.method, c.req.path, c.res.status, actingFor));
    } catch {
      // 操作ログはファイル。書けなくても業務の応答は変えない。
    }
  };
}
