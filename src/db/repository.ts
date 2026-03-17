/**
 * Repository abstraction layer
 *
 * DB方言 (SQLite / PostgreSQL / MySQL) の差異を吸収し、
 * ルートハンドラが直接 Drizzle クエリを書かなくて済むようにする。
 */

import { eq, count } from "drizzle-orm";
import { db, schema, curriculumSchema } from "./connection.js";

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

// ─── M1: Department Repository ─────────────────────────────

export type Department = typeof curriculumSchema.departments.$inferSelect;
export type NewDepartment = typeof curriculumSchema.departments.$inferInsert;

export const departmentRepo = {
  async findAll(): Promise<Department[]> {
    return db.select().from(curriculumSchema.departments);
  },

  async create(data: NewDepartment): Promise<void> {
    await db.insert(curriculumSchema.departments).values(data);
  },

  async update(id: string, data: { name: string }): Promise<void> {
    await db
      .update(curriculumSchema.departments)
      .set(data)
      .where(eq(curriculumSchema.departments.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(curriculumSchema.departments)
      .where(eq(curriculumSchema.departments.id, id));
  },
};

// ─── M1: Instructor Repository ─────────────────────────────

export type Instructor = typeof curriculumSchema.instructors.$inferSelect;
export type NewInstructor = typeof curriculumSchema.instructors.$inferInsert;

export const instructorRepo = {
  async findAll(): Promise<Instructor[]> {
    return db.select().from(curriculumSchema.instructors);
  },

  async create(data: NewInstructor): Promise<void> {
    await db.insert(curriculumSchema.instructors).values(data);
  },

  async update(id: string, data: { name: string }): Promise<void> {
    await db
      .update(curriculumSchema.instructors)
      .set(data)
      .where(eq(curriculumSchema.instructors.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(curriculumSchema.instructors)
      .where(eq(curriculumSchema.instructors.id, id));
  },
};

// ─── M1: Curriculum Repository ─────────────────────────────

export type Curriculum = typeof curriculumSchema.curricula.$inferSelect;
export type NewCurriculum = typeof curriculumSchema.curricula.$inferInsert;

export const curriculumRepo = {
  async findAll(): Promise<Curriculum[]> {
    return db.select().from(curriculumSchema.curricula);
  },

  async findByDepartment(departmentId: string): Promise<Curriculum[]> {
    return db
      .select()
      .from(curriculumSchema.curricula)
      .where(eq(curriculumSchema.curricula.departmentId, departmentId));
  },

  async create(data: NewCurriculum): Promise<void> {
    await db.insert(curriculumSchema.curricula).values(data);
  },

  async update(
    id: string,
    data: Partial<Omit<NewCurriculum, "id">>,
  ): Promise<void> {
    await db
      .update(curriculumSchema.curricula)
      .set(data)
      .where(eq(curriculumSchema.curricula.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(curriculumSchema.curricula)
      .where(eq(curriculumSchema.curricula.id, id));
  },
};

// ─── M1: Instructor Available Slots Repository ─────────────

export type AvailableSlot = typeof curriculumSchema.instructorAvailableSlots.$inferSelect;
export type NewAvailableSlot = typeof curriculumSchema.instructorAvailableSlots.$inferInsert;

export const availableSlotRepo = {
  async findByInstructor(instructorId: string): Promise<AvailableSlot[]> {
    return db
      .select()
      .from(curriculumSchema.instructorAvailableSlots)
      .where(eq(curriculumSchema.instructorAvailableSlots.instructorId, instructorId));
  },

  async deleteByInstructor(instructorId: string): Promise<void> {
    await db
      .delete(curriculumSchema.instructorAvailableSlots)
      .where(eq(curriculumSchema.instructorAvailableSlots.instructorId, instructorId));
  },

  async create(data: NewAvailableSlot): Promise<void> {
    await db.insert(curriculumSchema.instructorAvailableSlots).values(data);
  },
};
