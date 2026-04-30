/**
 * Event / Task の事前通知 (Nuntius reminders) ヘルパ
 *
 * Actio の event / task / personalEvent などで「N 分前に通知して」を統一的に
 * 扱うラッパ。 Nuntius の `/api/notify/user` (channel-agnostic) を呼ぶので、
 * 受信 channel はユーザの notification_preferences で決まる。
 *
 * idempotencyKey に `actio.event.<id>.reminder.<minutes>` または
 * `actio.task.<id>.reminder.<minutes>` を使うことで、 同じ event/task を
 * 2 回保存しても reminder は重複しない。
 *
 * cancel は Nuntius `DELETE /api/messages/by-source` の sourcePrefix 検索で
 * 該当 event/task の全 reminders を一括 cancel する。
 */

import { secretManager } from "../config/secrets.js";

const TOLERANCE_MS = 5_000; // 過去 5 秒以内なら現在時刻に丸めて即時送る

interface NuntiusNotifyBody {
  userId: string;
  title: string;
  body: string;
  url?: string;
  sendAt?: string;
  source?: string;
  idempotencyKey?: string;
}

interface ScheduleEventReminderInput {
  eventId: string;
  userId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  /** N 分前 (単数 or 配列)。 0 / 負値 / 過去過ぎは無視。 */
  minutesBefore?: number | number[];
  /** 通知本文 (省略時は description 抜粋) */
  notifyMessage?: string;
}

interface ScheduleTaskReminderInput {
  taskId: string;
  userId: string;
  title: string;
  description?: string | null;
  /** deadline (期限)。 null/undefined なら何もしない。 */
  deadline: Date | null;
  /** N 分前 (単数 or 配列)。 0 / 負値 / 過去過ぎは無視。 */
  minutesBefore?: number | number[];
  /** 通知本文 (省略時は description 抜粋) */
  notifyMessage?: string;
}

function nuntiusUrl(): string | null {
  const url = secretManager.getOrDefault("NUNTIUS_URL", "");
  return url ? url.replace(/\/$/, "") : null;
}

/** Cernere project_token を取得 (nuntius-client.ts と同じ仕組み、 簡略版) */
const tokenCache: { value: string; expiresAt: number } = { value: "", expiresAt: 0 };
async function getProjectToken(): Promise<string | null> {
  if (tokenCache.value && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
  const clientId = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_ID", "");
  const clientSecret = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_SECRET", "");
  if (!cernereUrl || !clientId || !clientSecret) return null;
  const res = await fetch(`${cernereUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "project_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string; expiresIn?: number };
  tokenCache.value = data.accessToken;
  tokenCache.expiresAt = Date.now() + ((data.expiresIn ?? 3600) - 300) * 1000;
  return data.accessToken;
}

async function postNotify(body: NuntiusNotifyBody): Promise<void> {
  const url = nuntiusUrl();
  if (!url) return; // 未設定なら no-op
  const token = await getProjectToken();
  if (!token) return;
  const res = await fetch(`${url}/api/notify/user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409 /* 既存 idempotency key */) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nuntius /api/notify/user ${res.status}: ${text}`);
  }
}

/** Nuntius `DELETE /api/messages/by-source` を sourcePrefix で叩く共通処理 */
async function cancelBySourcePrefix(sourcePrefix: string): Promise<{ count: number } | null> {
  const url = nuntiusUrl();
  if (!url) return null;
  const token = await getProjectToken();
  if (!token) return null;
  const res = await fetch(`${url}/api/messages/by-source`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sourcePrefix }),
  });
  if (!res.ok) {
    // 404 (ルート未実装) は古い Nuntius を黙認、それ以外は warn
    if (res.status !== 404) {
      const text = await res.text().catch(() => "");
      console.warn(`[reminders] cancel-by-source ${res.status}: ${text}`);
    }
    return null;
  }
  return (await res.json().catch(() => null)) as { count: number } | null;
}

/**
 * Event 開始の N 分前に通知を予約する。 minutesBefore が無指定なら何もしない。
 * 既に過去の時刻になる場合は、 「それでも 5 秒以上未来」 なら予約、 そうでなければ skip。
 */
export async function scheduleEventReminders(input: ScheduleEventReminderInput): Promise<void> {
  const minutes = normalizeMinutes(input.minutesBefore);
  if (minutes.length === 0) return;
  if (!nuntiusUrl()) return;

  const body = (input.notifyMessage ?? input.description ?? "").trim();
  const startMs = input.startTime.getTime();
  const now = Date.now();

  for (const m of minutes) {
    const sendAtMs = startMs - m * 60 * 1000;
    if (sendAtMs < now - TOLERANCE_MS) continue; // 過去過ぎは捨てる
    const sendAt = new Date(Math.max(sendAtMs, now)).toISOString();
    const title = m === 0
      ? `予定開始: ${input.title}`
      : `${input.title} まで ${m} 分`;
    await postNotify({
      userId: input.userId,
      title,
      body: body || formatStartLine(input.startTime),
      sendAt,
      source: `actio.event.${input.eventId}.reminder`,
      idempotencyKey: `actio.event.${input.eventId}.reminder.${m}`,
    });
  }
}

/**
 * Task 期限の N 分前に通知を予約する。 deadline 未設定 / minutesBefore 無指定
 * なら何もしない。 既に過去の時刻になる場合は、 「それでも 5 秒以上未来」 なら
 * 予約、 そうでなければ skip。
 */
export async function scheduleTaskReminders(input: ScheduleTaskReminderInput): Promise<void> {
  if (!input.deadline) return;
  const minutes = normalizeMinutes(input.minutesBefore);
  if (minutes.length === 0) return;
  if (!nuntiusUrl()) return;

  const body = (input.notifyMessage ?? input.description ?? "").trim();
  const deadlineMs = input.deadline.getTime();
  const now = Date.now();

  for (const m of minutes) {
    const sendAtMs = deadlineMs - m * 60 * 1000;
    if (sendAtMs < now - TOLERANCE_MS) continue;
    const sendAt = new Date(Math.max(sendAtMs, now)).toISOString();
    const title = m === 0
      ? `タスク期限: ${input.title}`
      : `${input.title} の期限まで ${m} 分`;
    await postNotify({
      userId: input.userId,
      title,
      body: body || formatDeadlineLine(input.deadline),
      sendAt,
      source: `actio.task.${input.taskId}.reminder`,
      idempotencyKey: `actio.task.${input.taskId}.reminder.${m}`,
    });
  }
}

/**
 * Event 削除時に対応する reminders をキャンセルする。
 * Nuntius `DELETE /api/messages/by-source?sourcePrefix=actio.event.<id>.reminder`
 * で pending 状態の予約をすべて cancelled にする。
 */
export async function cancelEventReminders(eventId: string): Promise<void> {
  await cancelBySourcePrefix(`actio.event.${eventId}.reminder`);
}

/** Task 削除時に対応する reminders をキャンセルする。 */
export async function cancelTaskReminders(taskId: string): Promise<void> {
  await cancelBySourcePrefix(`actio.task.${taskId}.reminder`);
}

function normalizeMinutes(input: number | number[] | undefined): number[] {
  if (input === undefined || input === null) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 60 * 24 * 30) // 30 日上限
    .map((n) => Math.floor(n));
}

function formatStartLine(start: Date): string {
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  return `開始: ${hh}:${mm}`;
}

function formatDeadlineLine(deadline: Date): string {
  const yyyy = deadline.getFullYear();
  const mo = String(deadline.getMonth() + 1).padStart(2, "0");
  const dd = String(deadline.getDate()).padStart(2, "0");
  const hh = String(deadline.getHours()).padStart(2, "0");
  const mm = String(deadline.getMinutes()).padStart(2, "0");
  return `期限: ${yyyy}-${mo}-${dd} ${hh}:${mm}`;
}
