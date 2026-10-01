/**
 * 定期同期の実行判定 (純粋関数, PLAN §1.2, completion.md AT-PM-SYNC)
 *
 * 最後に試みた時刻 (成功時刻か、失敗も含む試行時刻の遅い方) から同期間隔が過ぎたら実行する。
 * 失敗時も間隔を空けるので、外部 API が落ちている間に毎分叩き続けない。
 */

export interface SyncScheduleInput {
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  lastSyncResult: Record<string, unknown> | null;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function lastSyncAttempt(input: SyncScheduleInput): number | null {
  const times = [parseTime(input.lastSyncedAt), parseTime(input.lastSyncResult?.attemptedAt)].filter((t): t is number => t !== null);
  return times.length > 0 ? Math.max(...times) : null;
}

export function isSyncDue(input: SyncScheduleInput, now: Date): boolean {
  if (input.syncIntervalMinutes <= 0) return false;
  const last = lastSyncAttempt(input);
  if (last === null) return true;
  return now.getTime() - last >= input.syncIntervalMinutes * 60_000;
}
