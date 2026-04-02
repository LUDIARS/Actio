/**
 * コンフリクト検知・解決ロジック
 */

import type { ConflictResolution, FieldChange } from "../types.js";

interface TaskSnapshot {
  [key: string]: unknown;
}

interface ConflictInfo {
  taskId: string;
  localVersion: TaskSnapshot;
  externalVersion: TaskSnapshot;
  baseVersion: TaskSnapshot;
}

interface ResolveResult {
  resolution: ConflictResolution;
  mergedData: TaskSnapshot;
}

/** 変更率を計算 (0.0 ~ 1.0) */
function calculateDiffRatio(base: TaskSnapshot, target: TaskSnapshot): number {
  const keys = new Set([...Object.keys(base), ...Object.keys(target)]);
  if (keys.size === 0) return 0;

  let changedCount = 0;
  for (const key of keys) {
    if (JSON.stringify(base[key]) !== JSON.stringify(target[key])) {
      changedCount++;
    }
  }

  return changedCount / keys.size;
}

/** ステータスの大きな変更かどうか */
function isStatusMajorChange(local: TaskSnapshot, external: TaskSnapshot): boolean {
  const localStatus = local.status as string | undefined;
  const externalStatus = external.status as string | undefined;
  if (!localStatus || !externalStatus) return false;

  // open ↔ closed は大きな変更
  if (
    (localStatus === "open" && externalStatus === "closed") ||
    (localStatus === "closed" && externalStatus === "open")
  ) {
    return true;
  }
  return false;
}

/** 各バージョンの変更フィールドを取得 */
function getChangedFields(base: TaskSnapshot, version: TaskSnapshot): Set<string> {
  const changed = new Set<string>();
  const keys = new Set([...Object.keys(base), ...Object.keys(version)]);
  for (const key of keys) {
    if (JSON.stringify(base[key]) !== JSON.stringify(version[key])) {
      changed.add(key);
    }
  }
  return changed;
}

/**
 * コンフリクトを解決する
 *
 * Stage 1: フィールドマージ (変更フィールドが重複しない場合)
 * Stage 2: Claude Code マージ (将来実装)
 * Stage 3: 大幅な乖離 → 外部優先
 */
export function resolveConflict(conflict: ConflictInfo): ResolveResult {
  const { baseVersion, localVersion, externalVersion } = conflict;

  // Stage 3: 大幅な乖離チェック
  const diffRatio = calculateDiffRatio(baseVersion, externalVersion);
  if (diffRatio > 0.7 || isStatusMajorChange(localVersion, externalVersion)) {
    return {
      resolution: "force_external",
      mergedData: { ...externalVersion },
    };
  }

  // 変更フィールドの重複チェック
  const localChanges = getChangedFields(baseVersion, localVersion);
  const externalChanges = getChangedFields(baseVersion, externalVersion);

  const overlapping = new Set(
    [...localChanges].filter((f) => externalChanges.has(f))
  );

  // Stage 1: フィールドレベルマージ (重複なし)
  if (overlapping.size === 0) {
    const merged: TaskSnapshot = { ...baseVersion };

    // ローカル変更を適用
    for (const field of localChanges) {
      merged[field] = localVersion[field];
    }
    // 外部変更を適用
    for (const field of externalChanges) {
      merged[field] = externalVersion[field];
    }

    return {
      resolution: "auto_field_merge",
      mergedData: merged,
    };
  }

  // Stage 2: 重複あり → 現時点では外部優先 (Claude Code マージは将来実装)
  // 重複しないフィールドはローカルを残し、重複フィールドは外部を優先
  const merged: TaskSnapshot = { ...baseVersion };
  for (const field of localChanges) {
    if (!overlapping.has(field)) {
      merged[field] = localVersion[field];
    }
  }
  for (const field of externalChanges) {
    merged[field] = externalVersion[field];
  }

  return {
    resolution: "force_external",
    mergedData: merged,
  };
}

/**
 * コンフリクトの変更詳細を取得
 */
export function getConflictDetails(conflict: ConflictInfo): {
  localChanges: FieldChange[];
  externalChanges: FieldChange[];
  overlappingFields: string[];
} {
  const { baseVersion, localVersion, externalVersion } = conflict;

  const localFields = getChangedFields(baseVersion, localVersion);
  const externalFields = getChangedFields(baseVersion, externalVersion);

  const localChanges: FieldChange[] = [...localFields].map((f) => ({
    field: f,
    before: baseVersion[f],
    after: localVersion[f],
  }));

  const externalChanges: FieldChange[] = [...externalFields].map((f) => ({
    field: f,
    before: baseVersion[f],
    after: externalVersion[f],
  }));

  const overlappingFields = [...localFields].filter((f) => externalFields.has(f));

  return { localChanges, externalChanges, overlappingFields };
}
