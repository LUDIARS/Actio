/**
 * Event の事前通知 (Nuntius reminders) ヘルパ
 *
 * Actio の event / task / personalEvent などで「N 分前に通知して」を統一的に
 * 扱うラッパ。 Nuntius の `/api/notify/user` (channel-agnostic) を呼ぶので、
 * 受信 channel はユーザの notification_preferences で決まる。
 *
 * idempotencyKey に `actio.event.<id>.reminder.<minutes>` を使うことで、
 * 同じ event を 2 回保存しても reminder は重複しない。
 *
 * cancel は対応する idempotencyKey を Nuntius 側で resolve できないため、
 * 現状は best-effort で「event id を含む source の予約を全部消す」 API が
 * 必要。 暫定として scheduledMessages.source を使った検索ベースで実装。
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
 * Event 削除時に対応する reminders をキャンセルする。
 * Nuntius 側に「source 検索で一括 cancel」 API が無いので、 idempotencyKey の
 * 慣例に基づいた DELETE を試みる。 `idempotencyKey` ベースの cancel が
 * Nuntius 側で実装されたらここを置き換える。
 *
 * 現状は best-effort で、 source プレフィックスを含む scheduled_messages を
 * Nuntius worker が将来削除する想定 (実装は別 PR)。
 */
export async function cancelEventReminders(_eventId: string): Promise<void> {
  // TODO: Nuntius に source-based bulk cancel API を追加してから実装
  // (現状は worker 側で過去予約を放置しても dispatcher が「対象 event 不在」を
  //  検知できないので、 通知が出る可能性あり — 別 PR で対処)
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
