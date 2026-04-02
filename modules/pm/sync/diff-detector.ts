/**
 * タスク変更差分の比較ロジック
 */

import { createHash } from "crypto";
import type { FieldChange, TaskDiff, ExternalTask, PMTaskStatus } from "../types.js";

/** 差分検知対象フィールド */
const TRACKED_FIELDS: (keyof ExternalTask)[] = [
  "title",
  "status",
  "priority",
  "assignees",
  "labels",
  "dueDate",
  "description",
  "milestoneExternalId",
  "milestoneName",
];

interface StoredTask {
  externalId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignees: string[];
  labels: string[];
  dueDate: string | null;
  milestoneExternalId: string | null;
  milestoneName: string | null;
  descriptionHash: string | null;
}

/**
 * 本文のハッシュを計算する (差分検知用)
 */
export function hashDescription(desc: string | null): string {
  if (!desc) return "";
  return createHash("sha256").update(desc).digest("hex").slice(0, 16);
}

/**
 * 外部タスクと保存済みタスクの差分を検出する
 */
export function detectChanges(
  externalTask: ExternalTask,
  storedTask: StoredTask | undefined
): TaskDiff | null {
  if (!storedTask) {
    return {
      taskExternalId: externalTask.externalId,
      changeType: "created",
      changes: [],
    };
  }

  const changes: FieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const externalValue = externalTask[field];
    const storedValue = storedTask[field as keyof StoredTask];

    if (field === "description") {
      const externalHash = hashDescription(externalValue as string | null);
      if (externalHash !== (storedTask.descriptionHash ?? "")) {
        changes.push({
          field: "description",
          before: storedTask.description,
          after: externalValue,
        });
      }
      continue;
    }

    if (field === "assignees" || field === "labels") {
      const exArr = (externalValue as string[]).slice().sort();
      const stArr = (storedValue as string[]).slice().sort();
      if (JSON.stringify(exArr) !== JSON.stringify(stArr)) {
        changes.push({ field, before: storedValue, after: externalValue });
      }
      continue;
    }

    if (String(externalValue ?? "") !== String(storedValue ?? "")) {
      changes.push({ field, before: storedValue, after: externalValue });
    }
  }

  if (changes.length === 0) return null;

  // ステータス変更に応じた changeType 判定
  let changeType: TaskDiff["changeType"] = "updated";
  const statusChange = changes.find((c) => c.field === "status");
  if (statusChange) {
    const newStatus = String(statusChange.after);
    const oldStatus = String(statusChange.before);
    if (newStatus === "closed") changeType = "closed";
    else if (oldStatus === "closed") changeType = "reopened";
  }

  return {
    taskExternalId: externalTask.externalId,
    changeType,
    changes,
  };
}

/**
 * 複数タスクの差分を一括検出。削除されたタスクも検知する。
 */
export function detectAllChanges(
  externalTasks: ExternalTask[],
  storedTasks: StoredTask[]
): { diffs: TaskDiff[]; deletedExternalIds: string[] } {
  const storedMap = new Map(storedTasks.map((t) => [t.externalId, t]));
  const externalIds = new Set(externalTasks.map((t) => t.externalId));

  const diffs: TaskDiff[] = [];

  for (const ext of externalTasks) {
    const diff = detectChanges(ext, storedMap.get(ext.externalId));
    if (diff) diffs.push(diff);
  }

  // 外部に存在しなくなったタスクを検出
  const deletedExternalIds = storedTasks
    .filter((t) => !externalIds.has(t.externalId))
    .map((t) => t.externalId);

  return { diffs, deletedExternalIds };
}
