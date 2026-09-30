/**
 * tasks テーブルへの書き込み通知。
 *
 * リポジトリ層は上位モジュール (キャッシュ等) を知らないため、 書き込み後に
 * ここへ通知し、 購読側が必要な後始末 (一覧キャッシュの無効化など) を行う。
 */

type TaskWriteListener = () => void;

const listeners = new Set<TaskWriteListener>();

export function onTaskWrite(listener: TaskWriteListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyTaskWrite(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("[task-write] listener failed:", err instanceof Error ? err.message : String(err));
    }
  }
}
