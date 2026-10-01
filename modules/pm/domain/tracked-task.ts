/**
 * 同期で比較・マージするタスクのフィールド (PLAN §1.3)。
 * 外部値・Actio 側の値・前回同期時点の値 (base) を同じ形で扱うための純粋な型と変換。
 */

import { z } from "zod";
import { PM_PRIORITIES, PM_TASK_STATUSES } from "../types.js";

export const trackedTaskSchema = z.object({
  title: z.string().min(1).max(1000),
  description: z.string().max(200_000).nullable(),
  status: z.enum(PM_TASK_STATUSES),
  priority: z.enum(PM_PRIORITIES),
  assignees: z.array(z.string().max(200)).max(100),
  labels: z.array(z.string().max(200)).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  milestoneExternalId: z.string().max(200).nullable(),
  milestoneName: z.string().max(1000).nullable(),
});

export type TrackedTask = z.infer<typeof trackedTaskSchema>;
export type TrackedField = keyof TrackedTask;

export const TRACKED_FIELDS = Object.keys(trackedTaskSchema.shape) as TrackedField[];

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** 任意の行 (DB 行・外部タスク・スナップショット) から比較対象のフィールドだけを取り出す。 */
export function toTrackedTask(source: Record<string, unknown>): TrackedTask {
  const status = PM_TASK_STATUSES.find((s) => s === source.status) ?? "open";
  const priority = PM_PRIORITIES.find((p) => p === source.priority) ?? "medium";
  return {
    title: typeof source.title === "string" ? source.title : "",
    description: stringOrNull(source.description),
    status,
    priority,
    assignees: stringArray(source.assignees),
    labels: stringArray(source.labels),
    dueDate: stringOrNull(source.dueDate),
    milestoneExternalId: stringOrNull(source.milestoneExternalId),
    milestoneName: stringOrNull(source.milestoneName),
  };
}

function normalize(field: TrackedField, value: unknown): string {
  if (field === "assignees" || field === "labels") {
    return JSON.stringify([...stringArray(value)].sort());
  }
  return JSON.stringify(value ?? null);
}

export function fieldEquals(field: TrackedField, a: TrackedTask, b: TrackedTask): boolean {
  return normalize(field, a[field]) === normalize(field, b[field]);
}

/** base から version で値が変わったフィールド。配列は順序を無視する。 */
export function changedFields(base: TrackedTask, version: TrackedTask): TrackedField[] {
  return TRACKED_FIELDS.filter((field) => !fieldEquals(field, base, version));
}
