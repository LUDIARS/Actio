/**
 * Repository abstraction layer
 *
 * DB方言 (SQLite / PostgreSQL / MySQL) の差異を吸収し、
 * ルートハンドラが直接 Drizzle クエリを書かなくて済むようにする。
 */

import { eq, count } from "drizzle-orm";
import { db, schema } from "./connection.js";

// ─── Types ──────────────────────────────────────────────────

export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;
export type Session = typeof schema.sessions.$inferSelect;
export type NewSession = typeof schema.sessions.$inferInsert;

// ─── User Repository ───────────────────────────────────────

export const userRepo = {
  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));
    return user;
  },

  async findById(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return user;
  },

  async findByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.googleId, googleId));
    return user;
  },

  async countAll(): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(schema.users);
    return result?.value ?? 0;
  },

  async create(data: NewUser): Promise<void> {
    await db.insert(schema.users).values(data);
  },

  async update(
    id: string,
    data: Partial<Omit<NewUser, "id">>,
  ): Promise<void> {
    await db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id));
  },
};

// ─── Session Repository ────────────────────────────────────

export const sessionRepo = {
  async findByRefreshToken(
    refreshToken: string,
  ): Promise<Session | undefined> {
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.refreshToken, refreshToken));
    return session;
  },

  async create(data: NewSession): Promise<void> {
    await db.insert(schema.sessions).values(data);
  },

  async updateRefreshToken(
    id: string,
    refreshToken: string,
  ): Promise<void> {
    await db
      .update(schema.sessions)
      .set({ refreshToken })
      .where(eq(schema.sessions.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, id));
  },

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.refreshToken, refreshToken));
  },
};
