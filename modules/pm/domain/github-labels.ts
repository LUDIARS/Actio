/**
 * GitHub Issue のラベルとタスクのステータス・優先度の対応 (github-sync.ts の取り込み規則の逆写像)。
 *
 * GitHub は state が open/closed しか無く、in_progress / review と優先度はラベルで表す。
 * 書き戻し時にラベルを合わせないと、次の Pull で Actio 側の変更が戻ってしまう。
 */

import type { PMPriority, PMTaskStatus } from "../types.js";

const STATUS_LABELS = ["in-progress", "wip", "in-review", "review"];
const PRIORITY_LABELS = ["critical", "P0", "high", "P1", "low", "P3"];

const STATUS_LABEL: Partial<Record<PMTaskStatus, string>> = {
  in_progress: "in-progress",
  review: "in-review",
};

const PRIORITY_LABEL: Partial<Record<PMPriority, string>> = {
  critical: "critical",
  high: "high",
  low: "low",
};

export function githubStateFor(status: PMTaskStatus): "open" | "closed" {
  return status === "closed" ? "closed" : "open";
}

/** ステータス・優先度のラベルを差し替え、それ以外のラベルは順序ごと保つ。 */
export function githubLabelsFor(labels: readonly string[], status: PMTaskStatus, priority: PMPriority): string[] {
  const kept = labels.filter((label) => !STATUS_LABELS.includes(label) && !PRIORITY_LABELS.includes(label));
  const statusLabel = STATUS_LABEL[status];
  const priorityLabel = PRIORITY_LABEL[priority];
  return [...kept, ...(statusLabel ? [statusLabel] : []), ...(priorityLabel ? [priorityLabel] : [])];
}
