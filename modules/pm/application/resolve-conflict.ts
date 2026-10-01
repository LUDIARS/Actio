/**
 * コンフリクトの解決ユースケース (PLAN §1.7, completion.md AT-PM-CONFLICT)
 *
 * 解決結果はタスクへ適用し、外部の値と違うフィールドが残れば dirty にして次の同期で書き戻す。
 * pending → resolved の切り替えを先に行い、同じコンフリクトを二重に適用しない。
 */

import { applyOverlappingResolution, overlayChanges, type ConflictVersions } from "../domain/conflict-policy.js";
import { buildMergeRequest, parseMergeResponse } from "../domain/merge-prompt.js";
import { conflictNotification, type PmNotificationIntent } from "../domain/notifications.js";
import { changedFields, toTrackedTask, trackedTaskSchema, type TrackedTask } from "../domain/tracked-task.js";
import type { MergeModel } from "../llm/merge-client.js";
import type { PmConflictRow, PmConflictStore } from "./ports.js";

export class ConflictResolutionError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 503) {
    super(message);
  }
}

export type ManualChoice =
  | { kind: "force_external" }
  | { kind: "keep_local" }
  | { kind: "manual"; data: unknown };

export interface ResolveDeps {
  store: PmConflictStore;
  enqueue: (intents: readonly PmNotificationIntent[]) => Promise<void>;
  now: () => Date;
  newId: () => string;
  hashDescription: (description: string | null) => string;
}

export interface ResolveOutcome {
  conflictId: string;
  resolution: string;
  resolvedData: TrackedTask;
  dirty: boolean;
}

function versionsOf(conflict: PmConflictRow): ConflictVersions {
  return {
    base: toTrackedTask(conflict.baseVersion),
    local: toTrackedTask(conflict.localVersion),
    external: toTrackedTask(conflict.externalVersion),
  };
}

async function loadPending(conflictId: string, deps: ResolveDeps): Promise<PmConflictRow> {
  const conflict = await deps.store.findConflict(conflictId);
  if (!conflict) throw new ConflictResolutionError("Conflict not found", 404);
  if (conflict.status !== "pending") throw new ConflictResolutionError("このコンフリクトは解決済みです", 409);
  return conflict;
}

async function apply(conflict: PmConflictRow, resolution: string, merged: TrackedTask, deps: ResolveDeps): Promise<ResolveOutcome> {
  const now = deps.now().toISOString();
  const claimed = await deps.store.markResolvedIfPending(conflict.id, {
    resolution,
    resolvedData: merged,
    status: "resolved",
    resolvedAt: now,
  });
  if (!claimed) throw new ConflictResolutionError("このコンフリクトは解決済みです", 409);

  const external = toTrackedTask(conflict.externalVersion);
  const dirty = changedFields(external, merged).length > 0;
  await deps.store.updateTask(conflict.taskId, {
    ...merged,
    descriptionHash: deps.hashDescription(merged.description),
    dirtyFlag: dirty ? 1 : 0,
    localUpdatedAt: now,
  });
  // 次の Pull の base は、解決に使った外部の値
  await deps.store.createSnapshot({
    id: deps.newId(),
    taskId: conflict.taskId,
    changeType: "resolved",
    changedFields: {},
    snapshotData: external,
    detectedAt: now,
  });
  await deps.store.invalidateAnalytics(conflict.projectId);
  return { conflictId: conflict.id, resolution, resolvedData: merged, dirty };
}

export async function resolveConflictManually(conflictId: string, choice: ManualChoice, deps: ResolveDeps): Promise<ResolveOutcome> {
  const conflict = await loadPending(conflictId, deps);
  const versions = versionsOf(conflict);
  let merged: TrackedTask;
  if (choice.kind === "force_external") merged = versions.external;
  else if (choice.kind === "keep_local") merged = versions.local;
  else {
    const parsed = trackedTaskSchema.partial().strict().safeParse(choice.data);
    if (!parsed.success) throw new ConflictResolutionError("resolvedData が不正です", 400);
    merged = { ...overlayChanges(versions), ...parsed.data };
  }
  return apply(conflict, choice.kind, merged, deps);
}

export async function autoMergeConflict(conflictId: string, model: MergeModel, deps: ResolveDeps, signal: AbortSignal): Promise<ResolveOutcome> {
  const conflict = await loadPending(conflictId, deps);
  const versions = versionsOf(conflict);
  const fields = changedFields(versions.base, versions.local).filter((f) => changedFields(versions.base, versions.external).includes(f));
  if (fields.length === 0) {
    return apply(conflict, "auto_field_merge", overlayChanges(versions), deps);
  }
  let parsed;
  try {
    parsed = parseMergeResponse(await model.complete(buildMergeRequest(versions, fields), signal), fields);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 失敗は人間の解決待ちに戻す。成功扱いにしない
    await deps.store.markNeedsHuman(conflict.id);
    throw new ConflictResolutionError(`LLM マージに失敗しました: ${message}`, 503);
  }
  const merged = applyOverlappingResolution(versions, fields, parsed.fields);
  const outcome = await apply(conflict, "claude_merge", merged, deps);
  const task = await deps.store.findTask(conflict.taskId);
  await deps.enqueue([
    conflictNotification(
      "claude_merged",
      { id: conflict.taskId, projectId: conflict.projectId, title: task?.title ?? merged.title },
      parsed.reason || `マージしたフィールド: ${fields.join(", ")}`,
      outcome.conflictId,
    ),
  ]);
  return outcome;
}
