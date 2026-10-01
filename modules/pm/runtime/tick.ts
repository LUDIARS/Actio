/**
 * PM の定期実行 (1 分 tick): 定期同期 → リマインダー巡回 → LLM マージ待ちのコンフリクトを 1 件。
 * 起動経路 (src/index.ts) から 1 回だけ呼ぶ。テストでは呼ばない。
 */

import { pmConflictRepo, pmProjectRepo, pmTaskRepo } from "../../../src/db/repository.js";
import { enqueueNotificationsSafely } from "../../task/notifications/enqueue.js";
import { runProjectReminders } from "../application/reminder-cycle.js";
import { autoMergeConflict } from "../application/resolve-conflict.js";
import { defaultSyncLock } from "../application/sync-project.js";
import { isSyncDue } from "../domain/sync-schedule.js";
import { createMergeModel, pmResolveDeps, runProjectSync } from "../infra/deps.js";

const PM_TICK_MS = 60_000;
const LLM_MERGES_PER_TICK = 1;

function warn(message: string, error: unknown): void {
  console.warn(`[pm] ${message}: ${error instanceof Error ? error.message : String(error)}`);
}

export async function runPmCycle(now: Date = new Date()): Promise<void> {
  const projects = await pmProjectRepo.findAll();
  for (const project of projects) {
    if (!defaultSyncLock.isRunning(project.id) && isSyncDue(project, now)) {
      try {
        const result = await runProjectSync(project);
        if (result.errors.length > 0) console.warn(`[pm] 同期でエラー (${project.id}): ${result.errors.join(" / ")}`);
      } catch (error) {
        warn(`同期を実行できませんでした (${project.id})`, error);
      }
    }
    try {
      await runProjectReminders(project, {
        listTasks: (projectId) => pmTaskRepo.findByProject(projectId),
        enqueue: (intents) => enqueueNotificationsSafely(intents),
        now: () => now,
      });
    } catch (error) {
      warn(`リマインダーを処理できませんでした (${project.id})`, error);
    }
  }

  const model = createMergeModel();
  if (!model.isConfigured()) return;
  for (const conflict of await pmConflictRepo.findPendingByResolution("claude_merge", LLM_MERGES_PER_TICK)) {
    try {
      await autoMergeConflict(conflict.id, model, pmResolveDeps, AbortSignal.timeout(90_000));
    } catch (error) {
      warn(`LLM マージを人間の解決待ちに戻しました (${conflict.id})`, error);
    }
  }
}

export function startPmTick(intervalMs: number = PM_TICK_MS): () => void {
  let isRunning = false;
  const runOnce = async (): Promise<void> => {
    if (isRunning) return;
    isRunning = true;
    try {
      await runPmCycle();
    } catch (error) {
      // 定期処理の例外を未処理 rejection にしない
      warn("tick でエラーを隔離しました", error);
    } finally {
      isRunning = false;
    }
  };
  void runOnce();
  const timer = setInterval(() => void runOnce(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
