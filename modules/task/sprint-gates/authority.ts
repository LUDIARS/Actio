// @spec スプリントフェーズの本人認証
import type { SprintPhaseDecision } from "@ludiars/terpsichore";
import type { Program } from "./query.js";

export interface DelegatedChange {
  action: string;
  effect: SprintPhaseDecision["effect"];
  /** 判断前の保留状態。 */
  held: boolean;
  /** 確認内容の保存には回答 ID が無い。 */
  eventId: string | null;
}

/**
 * 人間セッション以外にフェーズ操作を委ねる場合の条件。すべて判断と同じ transaction で評価し、
 * 投げた場合は回答も状態も保存しない。
 */
export interface DelegatedAuthority {
  authorize(): Program<void>;
  /** 判断内容と効果が確定した後、最初の業務書き込みの前に呼ぶ。監査行もここで残す。 */
  permit(sprintId: string, change: DelegatedChange): Program<void>;
}
