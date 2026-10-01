/**
 * Pull 時のタスク単位の判断 (spec/feature/pm/completion.md AT-PM-SYNC)。
 *
 * 外部変更の有無は「前回同期時点の外部値 (base)」との差で判定する。保存値との差で判定すると、
 * Actio 側の未送信編集が外部変更に見えて上書きされてしまうため。
 */

import { changedFields, type TrackedField, type TrackedTask } from "./tracked-task.js";

export type TaskSyncDecision =
  /** 外部も Actio 側も変わっていない */
  | { kind: "unchanged" }
  /** 外部は変わっていない。Actio 側の未送信編集を保持する (書き戻し待ち) */
  | { kind: "keep_local" }
  /** 外部だけが変わった。外部の値で上書きする */
  | { kind: "apply_external"; externalChanges: TrackedField[] }
  /** 両側が変わった。コンフリクト解決へ */
  | { kind: "conflict"; externalChanges: TrackedField[] }
  /** 未解決のコンフリクトがあるので、このタスクは人間・LLM の解決を待つ */
  | { kind: "await_resolution" };

export interface TaskSyncInput {
  base: TrackedTask;
  stored: TrackedTask;
  external: TrackedTask;
  localDirty: boolean;
  hasPendingConflict: boolean;
}

export function decideTaskSync(input: TaskSyncInput): TaskSyncDecision {
  if (input.hasPendingConflict) return { kind: "await_resolution" };
  const externalChanges = changedFields(input.base, input.external);
  if (externalChanges.length === 0) {
    return input.localDirty ? { kind: "keep_local" } : { kind: "unchanged" };
  }
  if (!input.localDirty) return { kind: "apply_external", externalChanges };
  return { kind: "conflict", externalChanges };
}

export type ExternalChangeType = "updated" | "closed" | "reopened";

export function externalChangeType(base: TrackedTask, external: TrackedTask): ExternalChangeType {
  if (base.status !== "closed" && external.status === "closed") return "closed";
  if (base.status === "closed" && external.status !== "closed") return "reopened";
  return "updated";
}
