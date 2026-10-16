/**
 * セッションストア — @actio/id-service に委譲
 *
 * セッションは DB (sessionRepo) だけに置く。Redis はキャッシュ専用で、止まると中身が消えてよい
 * ものしか置かない。Redis に置くと Redis 停止でログイン状態が失われるため、ここでは渡さない。
 */

import { createSessionStore } from "@ludiars/cernere-id-service";
import { sessionRepo } from "../db/repository.js";

export type { SessionData } from "@ludiars/cernere-id-service";

const store = createSessionStore(sessionRepo, () => null);

export const createSession = store.createSession;
export const findByRefreshToken = store.findByRefreshToken;
export const rotateRefreshToken = store.rotateRefreshToken;
export const deleteByRefreshToken = store.deleteByRefreshToken;
export const deleteById = store.deleteById;
