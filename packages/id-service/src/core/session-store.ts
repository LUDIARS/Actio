/**
 * セッションストア — DB に置く (Redis は 2026-10-16 に廃止)
 */

import { v4 as uuidv4 } from "uuid";
import type { IdSessionRepo } from "./types.js";

export interface SessionData {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionStore {
  createSession(userId: string, refreshToken: string, expiresAt: Date): Promise<SessionData>;
  findByRefreshToken(refreshToken: string): Promise<SessionData | null>;
  rotateRefreshToken(sessionId: string, oldRefreshToken: string, newRefreshToken: string, expiresAt: Date): Promise<void>;
  deleteByRefreshToken(refreshToken: string): Promise<void>;
  deleteById(sessionId: string): Promise<void>;
}

export function createSessionStore(sessionRepo: IdSessionRepo): SessionStore {
  return {
    async createSession(userId, refreshToken, expiresAt) {
      const session: SessionData = { id: uuidv4(), userId, refreshToken, expiresAt, createdAt: new Date() };
      await sessionRepo.create(session);
      return session;
    },

    async findByRefreshToken(refreshToken) {
      const dbSession = await sessionRepo.findByRefreshToken(refreshToken);
      if (!dbSession) return null;
      return {
        id: dbSession.id, userId: dbSession.userId, refreshToken: dbSession.refreshToken,
        expiresAt: new Date(dbSession.expiresAt), createdAt: new Date(dbSession.createdAt),
      };
    },

    async rotateRefreshToken(sessionId, _oldRefreshToken, newRefreshToken) {
      await sessionRepo.updateRefreshToken(sessionId, newRefreshToken);
    },

    async deleteByRefreshToken(refreshToken) {
      await sessionRepo.deleteByRefreshToken(refreshToken);
    },

    async deleteById(sessionId) {
      await sessionRepo.deleteById(sessionId);
    },
  };
}
