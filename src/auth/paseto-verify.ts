/**
 * Cernere PASETO V4 (Ed25519) 検証。
 *
 * Hub (Corpus) が `/api/auth/project-token` 経由で発行した PASETO トークンを
 * Actio が受理するための公開鍵 fetch + verify モジュール。
 *
 *   - 起動時 + 6h 毎に `GET <CERNERE_URL>/.well-known/cernere-public-key` から
 *     公開鍵を取得し in-memory に cache
 *   - kid 一致は強制せず、 cache 上の各鍵で順に verify を試す (Bibliotheca と同形)
 *   - audience は ACTIO_PUBLIC_URL (= Hub から渡された hub_url) と一致させる
 *   - 失敗時は null を返す (middleware 側で HS256 fallback を試す)
 *
 * 設計判断:
 *   - paseto 依存は新規追加 (jsonwebtoken は Actio 自身発行の service_token 用に残置)
 *   - Cernere との JWT_SECRET 共有を廃する Phase 1 の Actio 側対応 (Issue #91)
 */

import { V4 } from "paseto";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface KeyEntry {
  key: Buffer;
  fetchedAt: number;
}

const keyCache = new Map<string, KeyEntry>();
let refreshTimer: NodeJS.Timeout | null = null;

export interface PasetoIdentity {
  userId: string;
  role: string;
  displayName: string | null;
  projectKey: string | null;
}

interface PasetoVerifyOptions {
  cernereBaseUrl: string;
  audience: string;
}

let optsRef: PasetoVerifyOptions | null = null;

export function startPasetoVerify(opts: PasetoVerifyOptions): void {
  if (!opts.cernereBaseUrl || !opts.audience) {
    console.warn(
      "[paseto] CERNERE_URL または ACTIO_PUBLIC_URL 未設定 — PASETO 経路は無効 (HS256 のみで動作)",
    );
    return;
  }
  optsRef = {
    cernereBaseUrl: opts.cernereBaseUrl.replace(/\/+$/, ""),
    audience: opts.audience.replace(/\/+$/, ""),
  };
  void refreshPublicKeys();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => void refreshPublicKeys(), REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
  console.log(`[paseto] verify enabled (cernere=${optsRef.cernereBaseUrl}, audience=${optsRef.audience})`);
}

async function refreshPublicKeys(): Promise<void> {
  if (!optsRef) return;
  try {
    const res = await fetch(`${optsRef.cernereBaseUrl}/.well-known/cernere-public-key`);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const body = (await res.json()) as { keys?: Array<{ kid: string; public_key: string }> };
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    let added = 0;
    for (const k of keys) {
      if (!k?.kid || !k?.public_key) continue;
      const buf = Buffer.from(k.public_key, "base64");
      if (buf.length !== 32) {
        console.warn(`[paseto] skipped kid=${k.kid} (length=${buf.length})`);
        continue;
      }
      keyCache.set(k.kid, { key: buf, fetchedAt: Date.now() });
      added++;
    }
    console.log(`[paseto] public keys refreshed: +${added} total=${keyCache.size}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[paseto] refresh failed: ${msg} (cache=${keyCache.size})`);
  }
}

/**
 * `v4.public.*` トークンを検証し PasetoIdentity を返す。
 *   - 形式不一致: null (HS256 fallback 用)
 *   - verify 成功: identity
 *   - verify 失敗 (audience 不一致 / kid 全滅 / 期限切れ): null
 */
export async function verifyPasetoToken(token: string): Promise<PasetoIdentity | null> {
  if (!optsRef) return null;
  if (!token.startsWith("v4.public.")) return null;
  for (const [kid, entry] of keyCache.entries()) {
    try {
      const result = (await V4.verify(token, entry.key, {
        complete: true,
        audience: optsRef.audience,
      })) as { payload?: Record<string, unknown> } | Record<string, unknown>;
      const payload = (
        "payload" in result && result.payload ? result.payload : result
      ) as Record<string, unknown>;
      if (payload.kind !== "user_for_project") return null;
      const userId = typeof payload.sub === "string" ? payload.sub : null;
      if (!userId) return null;
      void kid;
      return {
        userId,
        role: typeof payload.role === "string" ? payload.role : "general",
        displayName:
          typeof payload.displayName === "string" ? payload.displayName : null,
        projectKey:
          typeof payload.projectKey === "string" ? payload.projectKey : null,
      };
    } catch {
      // try next kid
    }
  }
  return null;
}

/** テスト/診断用: 現状の cache サイズ。 */
export function pasetoKeyCacheSize(): number {
  return keyCache.size;
}
