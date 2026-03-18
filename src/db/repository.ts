/**
 * Repository abstraction layer
 *
 * DB方言 (SQLite / PostgreSQL / MySQL) の差異を吸収し、
 * ルートハンドラが直接 Drizzle クエリを書かなくて済むようにする。
 */

import { eq, and, count, inArray, desc } from "drizzle-orm";
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

// ─── Schedule Entry Repository ───────────────────────────────

export type ScheduleEntry = typeof schema.scheduleEntries.$inferSelect;
export type NewScheduleEntry = typeof schema.scheduleEntries.$inferInsert;

export const scheduleEntryRepo = {
  async findByTerm(termId: string): Promise<ScheduleEntry[]> {
    return db
      .select()
      .from(schema.scheduleEntries)
      .where(eq(schema.scheduleEntries.termId, termId));
  },

  async findConfirmedByTerm(termId: string): Promise<ScheduleEntry[]> {
    return db
      .select()
      .from(schema.scheduleEntries)
      .where(
        and(
          eq(schema.scheduleEntries.termId, termId),
          eq(schema.scheduleEntries.isConfirmed, true)
        )
      );
  },
};

// ─── Room Repository ────────────────────────────────────────

export const roomRepo = {
  async findAll() {
    return db.select().from(schema.rooms);
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

  async findByGroupAndUser(groupId: string, userId: string) {
    const [member] = await db
      .select()
      .from(schema.groupMembers)
      .where(
        and(
          eq(schema.groupMembers.groupId, groupId),
          eq(schema.groupMembers.userId, userId)
        )
      );
    return member;
  },

  async create(data: typeof schema.groupMembers.$inferInsert) {
    await db.insert(schema.groupMembers).values(data);
  },

  async deleteByGroupAndUser(groupId: string, userId: string) {
    await db
      .delete(schema.groupMembers)
      .where(
        and(
          eq(schema.groupMembers.groupId, groupId),
          eq(schema.groupMembers.userId, userId)
        )
      );
  },
};

// ─── Group Repository ───────────────────────────────────────

export const groupRepo = {
  async findAll() {
    return db.select().from(schema.groups);
  },

  async findById(id: string) {
    const [group] = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, id));
    return group;
  },

  async create(data: typeof schema.groups.$inferInsert) {
    await db.insert(schema.groups).values(data);
  },

  async update(id: string, data: Partial<typeof schema.groups.$inferInsert>) {
    await db
      .update(schema.groups)
      .set(data)
      .where(eq(schema.groups.id, id));
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

  async create(data: typeof schema.groupSchedules.$inferInsert) {
    await db.insert(schema.groupSchedules).values(data);
  },

  async findById(id: string) {
    const [schedule] = await db
      .select()
      .from(schema.groupSchedules)
      .where(eq(schema.groupSchedules.id, id));
    return schedule;
  },
};

// ─── Reservation Repository ──────────────────────────────────

export type Reservation = typeof schema.reservations.$inferSelect;
export type NewReservation = typeof schema.reservations.$inferInsert;

export const reservationRepo = {
  async findAll(): Promise<Reservation[]> {
    return db.select().from(schema.reservations);
  },

  async findById(id: string): Promise<Reservation | undefined> {
    const [row] = await db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.id, id));
    return row;
  },

  async findByGroupId(groupId: string): Promise<Reservation[]> {
    return db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.groupId, groupId));
  },

  async findConflict(roomId: string, day: number, period: number): Promise<Reservation[]> {
    return db
      .select()
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.roomId, roomId),
          eq(schema.reservations.day, day),
          eq(schema.reservations.period, period),
          eq(schema.reservations.status, "confirmed")
        )
      );
  },

  async create(data: NewReservation): Promise<Reservation> {
    const [row] = await db.insert(schema.reservations).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<Omit<NewReservation, "id">>): Promise<Reservation | undefined> {
    const [row] = await db
      .update(schema.reservations)
      .set(data)
      .where(eq(schema.reservations.id, id))
      .returning();
    return row;
  },

  async findConfirmedByRoom(roomId: string): Promise<Reservation[]> {
    return db
      .select()
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.roomId, roomId),
          eq(schema.reservations.status, "confirmed")
        )
      );
  },
};

// ─── Voting Event Repository ─────────────────────────────────

export type VotingEvent = typeof schema.votingEvents.$inferSelect;
export type NewVotingEvent = typeof schema.votingEvents.$inferInsert;

export const votingEventRepo = {
  async findAll(): Promise<VotingEvent[]> {
    return db.select().from(schema.votingEvents);
  },

  async findById(id: string): Promise<VotingEvent | undefined> {
    const [row] = await db
      .select()
      .from(schema.votingEvents)
      .where(eq(schema.votingEvents.id, id));
    return row;
  },

  async create(data: NewVotingEvent): Promise<void> {
    await db.insert(schema.votingEvents).values(data);
  },

  async update(id: string, data: Partial<Omit<NewVotingEvent, "id">>): Promise<void> {
    await db
      .update(schema.votingEvents)
      .set(data)
      .where(eq(schema.votingEvents.id, id));
  },

  async deleteById(id: string): Promise<void> {
    await db.delete(schema.votingEvents).where(eq(schema.votingEvents.id, id));
  },
};

// ─── Voting Candidate Repository ─────────────────────────────

export type VotingCandidate = typeof schema.votingCandidates.$inferSelect;
export type NewVotingCandidate = typeof schema.votingCandidates.$inferInsert;

export const votingCandidateRepo = {
  async findByEventId(eventId: string): Promise<VotingCandidate[]> {
    return db
      .select()
      .from(schema.votingCandidates)
      .where(eq(schema.votingCandidates.eventId, eventId));
  },

  async create(data: NewVotingCandidate): Promise<void> {
    await db.insert(schema.votingCandidates).values(data);
  },

  async deleteByEventId(eventId: string): Promise<void> {
    await db
      .delete(schema.votingCandidates)
      .where(eq(schema.votingCandidates.eventId, eventId));
  },
};

// ─── Vote Repository ─────────────────────────────────────────

export type Vote = typeof schema.votes.$inferSelect;
export type NewVote = typeof schema.votes.$inferInsert;

export const voteRepo = {
  async findByEventId(eventId: string): Promise<Vote[]> {
    return db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.eventId, eventId));
  },

  async findExisting(eventId: string, candidateId: string, userId: string): Promise<Vote | undefined> {
    const [row] = await db
      .select()
      .from(schema.votes)
      .where(
        and(
          eq(schema.votes.eventId, eventId),
          eq(schema.votes.candidateId, candidateId),
          eq(schema.votes.userId, userId)
        )
      );
    return row;
  },

  async create(data: NewVote): Promise<void> {
    await db.insert(schema.votes).values(data);
  },

  async update(id: string, data: Partial<Omit<NewVote, "id">>): Promise<void> {
    await db
      .update(schema.votes)
      .set(data)
      .where(eq(schema.votes.id, id));
  },

  async deleteByEventId(eventId: string): Promise<void> {
    await db.delete(schema.votes).where(eq(schema.votes.eventId, eventId));
  },
};

// ─── Webhook Endpoint Repository ─────────────────────────────

export type WebhookEndpoint = typeof schema.webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof schema.webhookEndpoints.$inferInsert;

export const webhookEndpointRepo = {
  async findAll(): Promise<WebhookEndpoint[]> {
    return db.select().from(schema.webhookEndpoints);
  },

  async findById(id: string): Promise<WebhookEndpoint | undefined> {
    const [row] = await db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, id));
    return row;
  },

  async findByCreatedBy(createdBy: string): Promise<WebhookEndpoint[]> {
    return db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.createdBy, createdBy));
  },

  async findActive(): Promise<WebhookEndpoint[]> {
    return db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.isActive, true));
  },

  async create(data: NewWebhookEndpoint): Promise<WebhookEndpoint> {
    const [row] = await db.insert(schema.webhookEndpoints).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<Omit<NewWebhookEndpoint, "id">>): Promise<WebhookEndpoint | undefined> {
    const [row] = await db
      .update(schema.webhookEndpoints)
      .set(data)
      .where(eq(schema.webhookEndpoints.id, id))
      .returning();
    return row;
  },

  async deleteById(id: string): Promise<WebhookEndpoint | undefined> {
    const [row] = await db
      .delete(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, id))
      .returning();
    return row;
  },
};

// ─── Webhook Delivery Log Repository ─────────────────────────

export type WebhookDeliveryLog = typeof schema.webhookDeliveryLogs.$inferSelect;
export type NewWebhookDeliveryLog = typeof schema.webhookDeliveryLogs.$inferInsert;

export const webhookDeliveryLogRepo = {
  async findByWebhookId(webhookId: string): Promise<WebhookDeliveryLog[]> {
    return db
      .select()
      .from(schema.webhookDeliveryLogs)
      .where(eq(schema.webhookDeliveryLogs.webhookId, webhookId));
  },

  async create(data: NewWebhookDeliveryLog): Promise<void> {
    await db.insert(schema.webhookDeliveryLogs).values(data);
  },
};

// ─── Notification Preference Repository ──────────────────────

export type NotificationPreference = typeof schema.notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof schema.notificationPreferences.$inferInsert;

export const notificationPreferenceRepo = {
  async findByUserId(userId: string): Promise<NotificationPreference[]> {
    return db
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId));
  },

  async findByUserAndChannel(userId: string, channel: string): Promise<NotificationPreference | undefined> {
    const [row] = await db
      .select()
      .from(schema.notificationPreferences)
      .where(
        and(
          eq(schema.notificationPreferences.userId, userId),
          eq(schema.notificationPreferences.channel, channel)
        )
      );
    return row;
  },

  async create(data: NewNotificationPreference): Promise<NotificationPreference> {
    const [row] = await db.insert(schema.notificationPreferences).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<Omit<NewNotificationPreference, "id">>): Promise<NotificationPreference | undefined> {
    const [row] = await db
      .update(schema.notificationPreferences)
      .set(data)
      .where(eq(schema.notificationPreferences.id, id))
      .returning();
    return row;
  },
};

// ─── Notification Repository ─────────────────────────────────

export type Notification = typeof schema.notifications.$inferSelect;
export type NewNotification = typeof schema.notifications.$inferInsert;

export const notificationRepo = {
  async findByUserId(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
  },

  async create(data: NewNotification): Promise<void> {
    await db.insert(schema.notifications).values(data);
  },

  async markAsRead(id: string): Promise<Notification | undefined> {
    const [row] = await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, id))
      .returning();
    return row;
  },
};

// ─── App Settings Repository ──────────────────────────────────

export type AppSetting = typeof schema.appSettings.$inferSelect;

export const appSettingsRepo = {
  async findAll(): Promise<AppSetting[]> {
    return db.select().from(schema.appSettings);
  },

  async findByKey(key: string): Promise<AppSetting | undefined> {
    const [row] = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, key));
    return row;
  },

  async upsert(key: string, value: string): Promise<void> {
    const existing = await this.findByKey(key);
    if (existing) {
      await db
        .update(schema.appSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.appSettings.key, key));
    } else {
      await db
        .insert(schema.appSettings)
        .values({ key, value, updatedAt: new Date() });
    }
  },

  async deleteByKey(key: string): Promise<void> {
    await db
      .delete(schema.appSettings)
      .where(eq(schema.appSettings.key, key));
  },
};

// ─── User List Repository (admin/user list queries) ──────────

export const userListRepo = {
  async findAllBasic() {
    return db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      major: schema.users.major,
      createdAt: schema.users.createdAt,
    }).from(schema.users);
  },

  async findByIds(userIds: string[]) {
    return db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      major: schema.users.major,
      createdAt: schema.users.createdAt,
    }).from(schema.users)
      .where(inArray(schema.users.id, userIds));
  },

  async findUserNamesById(userIds: string[]) {
    return db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));
  },
};

// ─── Schedule Entry Repository (extended) ────────────────────

export const scheduleEntryExtRepo = {
  async findConfirmedByRoomAndSlot(roomId: string, day: number, period: number, termId: string): Promise<ScheduleEntry[]> {
    return db
      .select()
      .from(schema.scheduleEntries)
      .where(
        and(
          eq(schema.scheduleEntries.roomId, roomId),
          eq(schema.scheduleEntries.day, day),
          eq(schema.scheduleEntries.period, period),
          eq(schema.scheduleEntries.termId, termId),
          eq(schema.scheduleEntries.isConfirmed, true)
        )
      );
  },

  async findConfirmedByRoom(roomId: string, termId: string): Promise<ScheduleEntry[]> {
    return db
      .select()
      .from(schema.scheduleEntries)
      .where(
        and(
          eq(schema.scheduleEntries.roomId, roomId),
          eq(schema.scheduleEntries.termId, termId),
          eq(schema.scheduleEntries.isConfirmed, true)
        )
      );
  },
};
