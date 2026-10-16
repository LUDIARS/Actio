/**
 * ユーザー情報サービス
 *
 * Actio は個人データ (name, email, role など) を DB に保管しない。
 * すべて Cernere を単一情報源 (single source of truth) とし、Redis を
 * 揮発キャッシュとして利用する。
 *
 * 取得順序:
 *   1. Redis (session-cache) から取得
 *   2. miss なら Cernere (`fetchCernereProfile`) → Redis 書き戻し
 *   3. 失敗時は userId 由来のプレースホルダを返す (UI 劣化を許容)
 */

import { fetchCernereProfile } from "./cernere-client.js";
import {
  getSessionUser,
  saveSessionUser,
  type SessionUser,
} from "./session-cache.js";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

function placeholder(userId: string): UserInfo {
  return {
    id: userId,
    name: `user-${userId.slice(0, 8)}`,
    email: `${userId}@unknown.local`,
    role: "general",
  };
}

function fromSession(s: SessionUser): UserInfo {
  return { id: s.id, name: s.name, email: s.email, role: s.role };
}

/** 単一ユーザー情報を取得 (cache → Cernere → placeholder) */
export async function getUserInfo(userId: string): Promise<UserInfo> {
  const cached = await getSessionUser(userId);
  if (cached && cached.name && cached.email) return fromSession(cached);

  try {
    const profile = await fetchCernereProfile(userId);
    const info: UserInfo = {
      id: userId,
      name: profile.displayName,
      email: profile.email,
      role: profile.role || "general",
    };
    await saveSessionUser({ ...info } as SessionUser);
    return info;
  } catch (err) {
    console.warn(`[user-info] fetch failed for ${userId}, using placeholder:`, err);
    return placeholder(userId);
  }
}

/** 複数ユーザー情報を取得 (並列 fetch、cache 優先) */
export async function getUserInfos(userIds: string[]): Promise<Map<string, UserInfo>> {
  const map = new Map<string, UserInfo>();
  const uniqueIds = [...new Set(userIds)];
  await Promise.all(
    uniqueIds.map(async (id) => {
      map.set(id, await getUserInfo(id));
    }),
  );
  return map;
}

/** Cernere 側で更新された場合に手動でキャッシュを破棄したいケース用 */
export { invalidateSessionUser as invalidateUserInfo } from "./session-cache.js";

/**
 * Cernere **直接問い合わせ** による role 検証結果. Issue #111 S2 で
 * 導入. `getUserInfo()` と違って placeholder を返さず、Cernere から
 * 取れなかったら `source === "unreachable"` を返す (呼び出し側で
 * fail-closed / fail-open を決める).
 */
export interface VerifiedRole {
  userId: string;
  role:   string;
  /** どこから来た情報か. "unreachable" = Cernere が応答せず未確定. */
  source: "cernere" | "unreachable";
}

/**
 * Cernere に role 検証を投げ、プレースホルダを使わず事実だけを返す.
 *
 * 呼び出し側は `source === "unreachable"` を見て:
 *   - production → 403 (fail-closed, RULE §1.2 / Issue #111 S2)
 *   - development / test → JWT claim にフォールバック可
 * を判断する.
 */
export async function verifyRoleViaCernere(userId: string): Promise<VerifiedRole> {
  if (!userId) return { userId: "", role: "", source: "unreachable" };
  try {
    const profile = await fetchCernereProfile(userId);
    return {
      userId,
      role:   profile.role || "general",
      source: "cernere",
    };
  } catch (err) {
    console.warn(`[user-info] verifyRoleViaCernere: ${userId}:`, err);
    return { userId, role: "", source: "unreachable" };
  }
}
