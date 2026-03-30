/**
 * セッションストア — @schedula/id-service に委譲
 */

import { createSessionStore } from "../../packages/id-service/src/index.js";
import { sessionRepo } from "../db/repository.js";
import { getRedis } from "../db/redis.js";

export type { SessionData } from "../../packages/id-service/src/index.js";

const store = createSessionStore(sessionRepo, getRedis);

export const createSession = store.createSession;
export const findByRefreshToken = store.findByRefreshToken;
export const rotateRefreshToken = store.rotateRefreshToken;
export const deleteByRefreshToken = store.deleteByRefreshToken;
export const deleteById = store.deleteById;
