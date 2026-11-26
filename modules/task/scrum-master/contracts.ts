// @spec スクラムマスターの役割と権限
import { z } from "zod";

/** 役割に就ける AI。判断手順は workspace の MUSA Terpsichore スキルが持つ。 */
export const SCRUM_MASTER_HOLDER = "terpsichore";
/** フェーズ履歴・スプリント承認者に残す判断主体。 */
export const SCRUM_MASTER_ACTOR = `scrum-master:${SCRUM_MASTER_HOLDER}`;
/** 外部 API キーで役割を担う場合に必要な scope。 */
export const SCRUM_MASTER_SCOPE = "scrum-master";
/** この値を付けた要求はスクラムマスターとして扱い、フェーズ操作以外の書き込みを拒否する。 */
export const SCRUM_MASTER_HEADER = "x-actio-scrum-master";
/** この PC の AI セッションが名乗るセッション ID (監査用)。 */
export const AI_SESSION_HEADER = "x-actio-ai-session";

const AI_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const assignInput = z.object({ clientId: z.string().trim().min(1).max(200).nullable().default(null) }).strict();

export interface ScrumMasterAssignment {
  holder: string;
  /** null はこの PC の AI セッションが担う。値がある場合はその API クライアントだけが担う。 */
  clientId: string | null;
  assignedBy: string;
  assignedAt: string;
}

export interface ScrumMasterPrincipal {
  /** 監査に残す実行主体 (`ai-session:<id>` / `api-client:<id>`)。 */
  actor: string;
  clientId: string | null;
}

/** 形式の正しいセッション ID だけを主体にする。 */
export function aiSessionActor(sessionId: string | undefined): string | null {
  return sessionId && AI_SESSION_ID.test(sessionId) ? `ai-session:${sessionId}` : null;
}
