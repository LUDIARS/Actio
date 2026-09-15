/**
 * 通知の配送先 port (task-integration §2.4)。 実装は Cc / Memoria ごとに分ける。
 */

export interface NotificationTarget {
  teamId: string | null;
}

export interface NotificationSink {
  deliver(target: NotificationTarget, payload: Record<string, unknown>): Promise<void>;
}

/** 必須設定 (接続先) が無い。 再試行しても直らないので即 failed にする。 */
export class NotificationConfigError extends Error {}

export const NOTIFICATION_TIMEOUT_MS = 10_000;

/**
 * JSON を POST する共通処理。 エラー文には URL やネットワーク例外の中身を入れない
 * (接続先に資格情報が含まれることがあるため)。
 */
export async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: Record<string, unknown>,
  serviceName: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${serviceName} is unreachable`);
  }
  if (!response.ok) throw new Error(`${serviceName} returned HTTP ${response.status}`);
}
