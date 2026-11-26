// @spec スクラムマスターの認証と判断主体
import type { Context } from "hono";
import { localAccessKind } from "../../../src/auth/local-mode.js";
import { requireApiKey } from "../../external-api/middleware.js";
import {
  AI_SESSION_HEADER, SCRUM_MASTER_HEADER, SCRUM_MASTER_HOLDER, SCRUM_MASTER_SCOPE,
  aiSessionActor, type ScrumMasterPrincipal,
} from "./contracts.js";

/**
 * 実行主体を確定して `work` を呼ぶ。API キーがあれば専用 scope のクライアント、
 * 無ければこの PC から直接届いた AI セッションだけを受け付ける。役割の割当は呼び出し先が照合する。
 */
export async function asScrumMaster(
  c: Context, work: (principal: ScrumMasterPrincipal) => Promise<Response>,
): Promise<Response> {
  if (c.req.header(SCRUM_MASTER_HEADER) !== SCRUM_MASTER_HOLDER) {
    return c.json({ error: "このスクラムマスターは利用できません" }, 403);
  }
  if (c.req.header("X-API-Client-ID") !== undefined) {
    let response: Response | undefined;
    const denied = await requireApiKey(SCRUM_MASTER_SCOPE)(c, async () => {
      const id = c.get("apiClientId" as never) as string;
      response = await work({ actor: `api-client:${id}`, clientId: id });
    });
    if (denied) return denied;
    if (!response) throw new Error("Scrum master request produced no response");
    return response;
  }
  const actor = aiSessionActor(c.req.header(AI_SESSION_HEADER));
  if (localAccessKind(c) !== "loopback" || !actor) {
    return c.json({ error: "この PC の AI セッション ID、またはスクラムマスター用の API キーが必要です" }, 403);
  }
  return work({ actor, clientId: null });
}
