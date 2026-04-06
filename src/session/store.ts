/**
 * セッションストア — @schedula/id-service に委譲
 */

import { createSessionStore } from "@ludiars/cernere-id-service";
import { sessionRepo } from "../db/repository.js";
import { getRedis } from "../db/redis.js";

export type { SessionData } from "@ludiars/cernere-id-service";

const store = createSessionStore(sessionRepo, getRedis);

export const createSession = store.createSession;
export const findByRefreshToken = store.findByRefreshToken;
export const rotateRefreshToken = store.rotateRefreshToken;
export const deleteByRefreshToken = store.deleteByRefreshToken;
export const deleteById = store.deleteById;
