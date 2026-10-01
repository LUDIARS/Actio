/**
 * PM ユースケースの本番用 deps の組み立て (REST・WS・tick で共有)。
 */

import { v4 as uuidv4 } from "uuid";
import { secretManager } from "../../../src/config/secrets.js";
import { pmTaskRepo } from "../../../src/db/repository.js";
import { enqueueNotificationsSafely } from "../../task/notifications/enqueue.js";
import type { PmProjectRow } from "../application/ports.js";
import type { ResolveDeps } from "../application/resolve-conflict.js";
import { recordStatusChangeValidation } from "../application/status-change-validation.js";
import { syncProject, type StoredSyncResult, type SyncDeps } from "../application/sync-project.js";
import { ConfiguredMergeModel } from "../llm/merge-client.js";
import { hashDescription } from "../sync/diff-detector.js";
import { commitSourceFor, fetchExternalTasks, writebackTask } from "./external-source.js";
import { pmConflictStore, pmSyncStore, pmValidationStore } from "./repo-store.js";

/** review に変わったタスクの関連コミット検証。同期・タスク更新の応答を待たせない。 */
export function validateReviewTransitions(project: PmProjectRow, taskIds: string[]): void {
  void (async () => {
    for (const taskId of taskIds) {
      const task = await pmTaskRepo.findById(taskId);
      if (!task) continue;
      await recordStatusChangeValidation(task, commitSourceFor(project), pmValidationStore, uuidv4);
    }
  })().catch((error: unknown) => {
    console.warn(`[pm] ステータス変更時検証に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  });
}

export const pmSyncDeps: SyncDeps = {
  store: pmSyncStore,
  fetchExternal: fetchExternalTasks,
  writeback: writebackTask,
  enqueue: (intents) => enqueueNotificationsSafely(intents),
  onReviewTransition: validateReviewTransitions,
  now: () => new Date(),
  newId: () => uuidv4(),
  hashDescription,
};

export const pmResolveDeps: ResolveDeps = {
  store: pmConflictStore,
  enqueue: (intents) => enqueueNotificationsSafely(intents),
  now: () => new Date(),
  newId: () => uuidv4(),
  hashDescription,
};

export function runProjectSync(project: PmProjectRow): Promise<StoredSyncResult> {
  return syncProject(project, pmSyncDeps);
}

export function createMergeModel(): ConfiguredMergeModel {
  return new ConfiguredMergeModel((key) => secretManager.get(key));
}
