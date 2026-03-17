/**
 * Repository abstraction layer
 *
 * DB方言 (SQLite / PostgreSQL / MySQL) の差異を吸収し、
 * ルートハンドラが直接 Drizzle クエリを書かなくて済むようにする。
 */

import { eq, and, count } from "drizzle-orm";
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

// ─── M1: Curriculum Departments Repository ──────────────────

export type CurriculumDepartment = typeof curriculumSchema.curriculumDepartments.$inferSelect;
export type NewCurriculumDepartment = typeof curriculumSchema.curriculumDepartments.$inferInsert;

export const curriculumDepartmentRepo = {
  async findByCurriculum(curriculumId: string): Promise<CurriculumDepartment[]> {
    return db
      .select()
      .from(curriculumSchema.curriculumDepartments)
      .where(eq(curriculumSchema.curriculumDepartments.curriculumId, curriculumId));
  },

  async findAll(): Promise<CurriculumDepartment[]> {
    return db.select().from(curriculumSchema.curriculumDepartments);
  },

  async create(data: NewCurriculumDepartment): Promise<void> {
    await db.insert(curriculumSchema.curriculumDepartments).values(data);
  },

  async deleteByCurriculum(curriculumId: string): Promise<void> {
    await db
      .delete(curriculumSchema.curriculumDepartments)
      .where(eq(curriculumSchema.curriculumDepartments.curriculumId, curriculumId));
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

// ─── MyPlan Repository ──────────────────────────────────────

export type MyPlan = typeof schema.myPlans.$inferSelect;
export type NewMyPlan = typeof schema.myPlans.$inferInsert;

export const myPlanRepo = {
  async findByUserId(userId: string): Promise<MyPlan[]> {
    return db
      .select()
      .from(schema.myPlans)
      .where(eq(schema.myPlans.userId, userId));
  },

  async findById(id: string): Promise<MyPlan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.myPlans)
      .where(eq(schema.myPlans.id, id));
    return plan;
  },

  async findByIdAndUserId(id: string, userId: string): Promise<MyPlan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.myPlans)
      .where(
        and(
          eq(schema.myPlans.id, id),
          eq(schema.myPlans.userId, userId)
        )
      );
    return plan;
  },

  async create(data: NewMyPlan): Promise<void> {
    await db.insert(schema.myPlans).values(data);
  },

  async update(id: string, data: Partial<Omit<NewMyPlan, "id">>): Promise<void> {
    await db
      .update(schema.myPlans)
      .set(data)
      .where(eq(schema.myPlans.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(schema.myPlans)
      .where(eq(schema.myPlans.id, id));
  },
};

// ─── PersonalEvent Repository ───────────────────────────────

export type PersonalEvent = typeof schema.personalEvents.$inferSelect;
export type NewPersonalEvent = typeof schema.personalEvents.$inferInsert;

export const personalEventRepo = {
  async findByUserDayPeriod(
    userId: string,
    day: number,
    period: number,
  ): Promise<PersonalEvent | undefined> {
    const [event] = await db
      .select()
      .from(schema.personalEvents)
      .where(
        and(
          eq(schema.personalEvents.userId, userId),
          eq(schema.personalEvents.day, day),
          eq(schema.personalEvents.period, period)
        )
      );
    return event;
  },

  async findByUserId(userId: string): Promise<PersonalEvent[]> {
    return db
      .select()
      .from(schema.personalEvents)
      .where(eq(schema.personalEvents.userId, userId));
  },

  async findById(id: string): Promise<PersonalEvent | undefined> {
    const [event] = await db
      .select()
      .from(schema.personalEvents)
      .where(eq(schema.personalEvents.id, id));
    return event;
  },

  async findByIdAndUserId(id: string, userId: string): Promise<PersonalEvent | undefined> {
    const [event] = await db
      .select()
      .from(schema.personalEvents)
      .where(
        and(
          eq(schema.personalEvents.id, id),
          eq(schema.personalEvents.userId, userId)
        )
      );
    return event;
  },

  async deleteByUserAndPlan(userId: string, planId: string): Promise<void> {
    await db
      .delete(schema.personalEvents)
      .where(
        and(
          eq(schema.personalEvents.userId, userId),
          eq(schema.personalEvents.planId, planId)
        )
      );
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(schema.personalEvents)
      .where(eq(schema.personalEvents.id, id));
  },

  async create(data: NewPersonalEvent): Promise<void> {
    await db.insert(schema.personalEvents).values(data);
  },

  async update(id: string, data: Partial<Omit<NewPersonalEvent, "id">>): Promise<void> {
    await db
      .update(schema.personalEvents)
      .set(data)
      .where(eq(schema.personalEvents.id, id));
  },
};

// ─── Plan Repository ────────────────────────────────────────

export type Plan = typeof schema.plans.$inferSelect;
export type NewPlan = typeof schema.plans.$inferInsert;

export const planRepo = {
  async findByUserId(userId: string): Promise<Plan[]> {
    return db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.userId, userId));
  },

  async findById(id: string): Promise<Plan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, id));
    return plan;
  },

  async findByIdAndUserId(id: string, userId: string): Promise<Plan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.id, id),
          eq(schema.plans.userId, userId)
        )
      );
    return plan;
  },

  async create(data: NewPlan): Promise<void> {
    await db.insert(schema.plans).values(data);
  },

  async update(id: string, data: Partial<Omit<NewPlan, "id">>): Promise<void> {
    await db
      .update(schema.plans)
      .set(data)
      .where(eq(schema.plans.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(schema.plans)
      .where(eq(schema.plans.id, id));
  },
};

// ─── Scheduling Task Repository ─────────────────────────────

export type SchedulingTask = typeof schema.schedulingTasks.$inferSelect;
export type NewSchedulingTask = typeof schema.schedulingTasks.$inferInsert;

export const schedulingTaskRepo = {
  async findByGroupId(groupId: string): Promise<SchedulingTask[]> {
    return db
      .select()
      .from(schema.schedulingTasks)
      .where(eq(schema.schedulingTasks.groupId, groupId));
  },

  async findById(id: string): Promise<SchedulingTask | undefined> {
    const [task] = await db
      .select()
      .from(schema.schedulingTasks)
      .where(eq(schema.schedulingTasks.id, id));
    return task;
  },

  async findPendingByGroupId(groupId: string): Promise<SchedulingTask[]> {
    return db
      .select()
      .from(schema.schedulingTasks)
      .where(
        and(
          eq(schema.schedulingTasks.groupId, groupId),
          eq(schema.schedulingTasks.status, "pending")
        )
      );
  },

  async create(data: NewSchedulingTask): Promise<void> {
    await db.insert(schema.schedulingTasks).values(data);
  },

  async update(id: string, data: Partial<Omit<NewSchedulingTask, "id">>): Promise<void> {
    await db
      .update(schema.schedulingTasks)
      .set(data)
      .where(eq(schema.schedulingTasks.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(schema.schedulingTasks)
      .where(eq(schema.schedulingTasks.id, id));
  },
};

// ─── Scheduling Result Repository ───────────────────────────

export type SchedulingResult = typeof schema.schedulingResults.$inferSelect;
export type NewSchedulingResult = typeof schema.schedulingResults.$inferInsert;

export const schedulingResultRepo = {
  async findByGroupId(groupId: string): Promise<SchedulingResult[]> {
    return db
      .select()
      .from(schema.schedulingResults)
      .where(eq(schema.schedulingResults.groupId, groupId));
  },

  async findById(id: string): Promise<SchedulingResult | undefined> {
    const [result] = await db
      .select()
      .from(schema.schedulingResults)
      .where(eq(schema.schedulingResults.id, id));
    return result;
  },

  async create(data: NewSchedulingResult): Promise<void> {
    await db.insert(schema.schedulingResults).values(data);
  },

  async update(id: string, data: Partial<Omit<NewSchedulingResult, "id">>): Promise<void> {
    await db
      .update(schema.schedulingResults)
      .set(data)
      .where(eq(schema.schedulingResults.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db
      .delete(schema.schedulingResults)
      .where(eq(schema.schedulingResults.id, id));
  },
};

// ─── Group Member Repository ────────────────────────────────

export const groupMemberRepo = {
  async findByUserId(userId: string) {
    return db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.userId, userId));
  },

  async findByGroupId(groupId: string) {
    return db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.groupId, groupId));
  },
};

// ─── Group Repository ───────────────────────────────────────

export const groupRepo = {
  async findById(id: string) {
    const [group] = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, id));
    return group;
  },
};

// ─── Group Schedule Repository ──────────────────────────────

export const groupScheduleRepo = {
  async findByGroupId(groupId: string) {
    return db
      .select()
      .from(schema.groupSchedules)
      .where(eq(schema.groupSchedules.groupId, groupId));
  },
};
