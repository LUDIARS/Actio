/**
 * M3 MACHINA: PM (M2) リレーインターフェース
 *
 * M2「PM」モジュールへのタスク生成/更新をリレーする。
 * M2 モジュールが実装されるまでは stub として動作し、
 * M2 完成後にアダプタを差し替えることで接続する。
 */

import type { MachinaPmRelay } from "../../src/shared/types.js";
import type { MachinaTask as MachinaTaskRecord } from "../../src/db/repository.js";

/** PM リレーのコールバック型 */
type PmRelayAdapter = MachinaPmRelay;

/** 現在登録されているリレーアダプタ */
let currentAdapter: PmRelayAdapter | null = null;

/**
 * PM リレーアダプタを登録する
 * M2 モジュールが初期化時にこの関数を呼び出して接続する
 */
export function registerPmRelayAdapter(adapter: PmRelayAdapter): void {
  currentAdapter = adapter;
  console.log("[machina:pm-relay] PMリレーアダプタが登録されました");
}

/**
 * PM リレーアダプタが登録されているか
 */
export function hasPmRelay(): boolean {
  return currentAdapter !== null;
}

/**
 * PM にタスクを作成リレーする
 * アダプタ未登録時はログ出力のみ
 */
export async function relayTaskToPm(
  task: MachinaTaskRecord
): Promise<{ pmTaskId: string } | null> {
  if (!currentAdapter) {
    console.log(
      `[machina:pm-relay] PMアダプタ未登録 — タスク "${task.title}" (${task.id}) のリレーをスキップ`
    );
    return null;
  }

  try {
    const result = await currentAdapter.createTask(task as unknown as Parameters<MachinaPmRelay["createTask"]>[0]);
    console.log(
      `[machina:pm-relay] タスク "${task.title}" → PM (pmTaskId: ${result.pmTaskId})`
    );
    return result;
  } catch (err) {
    console.error(
      `[machina:pm-relay] PMリレーエラー: タスク "${task.title}"`,
      err
    );
    return null;
  }
}

/**
 * PM のタスクを更新リレーする
 */
export async function relayTaskUpdateToPm(
  pmTaskId: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  if (!currentAdapter) {
    console.log(
      `[machina:pm-relay] PMアダプタ未登録 — タスク更新 (${pmTaskId}) のリレーをスキップ`
    );
    return false;
  }

  try {
    await currentAdapter.updateTask(pmTaskId, updates as Partial<Parameters<MachinaPmRelay["createTask"]>[0]>);
    console.log(`[machina:pm-relay] PMタスク更新: ${pmTaskId}`);
    return true;
  } catch (err) {
    console.error(
      `[machina:pm-relay] PM更新リレーエラー: ${pmTaskId}`,
      err
    );
    return false;
  }
}
