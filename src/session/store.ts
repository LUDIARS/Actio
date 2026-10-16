/**
 * セッションストア — @actio/id-service に委譲
 *
 * セッションは DB (sessionRepo) だけに置く。Redis は使わない (2026-10-16 廃止)。
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
