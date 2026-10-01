/**
 * 双方向同期のコンフリクト解決方針 (PLAN §1.7, spec/feature/pm/completion.md AT-PM-CONFLICT)。
 *
 * Stage 3: 外部の変更率 > 70% または open↔closed → 外部を採用
 * Stage 1: 変更フィールドが重ならない → フィールド単位でマージ
 * Stage 2: 重なる → LLM マージ待ち (この関数ではマージしない)
 */

import { changedFields, TRACKED_FIELDS, type TrackedField, type TrackedTask } from "./tracked-task.js";

export const FORCE_EXTERNAL_DIFF_RATIO = 0.7;

export type ConflictDecision =
  | { stage: "force_external"; merged: TrackedTask; reason: "diff_ratio" | "status_major_change" }
  | { stage: "auto_field_merge"; merged: TrackedTask }
  | { stage: "claude_merge"; overlappingFields: TrackedField[] };

export interface ConflictVersions {
  base: TrackedTask;
  local: TrackedTask;
  external: TrackedTask;
}

function isStatusMajorChange(local: TrackedTask, external: TrackedTask): boolean {
  return (local.status === "open" && external.status === "closed")
    || (local.status === "closed" && external.status === "open");
}

/** 両側の変更を重ねた結果。overlapping のフィールドは外部の値になる。 */
export function overlayChanges({ base, local, external }: ConflictVersions): TrackedTask {
  const merged: TrackedTask = { ...base };
  const assign = <K extends TrackedField>(field: K, source: TrackedTask): void => {
    merged[field] = source[field];
  };
  for (const field of changedFields(base, local)) assign(field, local);
  for (const field of changedFields(base, external)) assign(field, external);
  return merged;
}

export function decideConflict(versions: ConflictVersions): ConflictDecision {
  const { base, local, external } = versions;
  const externalChanged = changedFields(base, external);
  const diffRatio = externalChanged.length / TRACKED_FIELDS.length;
  if (diffRatio > FORCE_EXTERNAL_DIFF_RATIO) {
    return { stage: "force_external", merged: { ...external }, reason: "diff_ratio" };
  }
  if (isStatusMajorChange(local, external)) {
    return { stage: "force_external", merged: { ...external }, reason: "status_major_change" };
  }

  const localChanged = new Set(changedFields(base, local));
  const overlapping = externalChanged.filter((field) => localChanged.has(field));
  if (overlapping.length === 0) {
    return { stage: "auto_field_merge", merged: overlayChanges(versions) };
  }
  return { stage: "claude_merge", overlappingFields: overlapping };
}

/** 重なったフィールドだけを差し替える。それ以外は両側の変更を重ねた値のまま。 */
export function applyOverlappingResolution(
  versions: ConflictVersions,
  overlappingFields: readonly TrackedField[],
  resolved: Partial<TrackedTask>,
): TrackedTask {
  const merged = overlayChanges(versions);
  for (const field of overlappingFields) {
    if (resolved[field] !== undefined) {
      (merged as Record<TrackedField, unknown>)[field] = resolved[field];
    }
  }
  return merged;
}
