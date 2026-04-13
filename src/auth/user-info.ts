/**
 * ユーザー情報サービス
 *
 * Schedula は個人データ (name, email, role など) を DB に保管しない。
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
