import { Hono } from "hono";
import { db, schema } from "../../db/connection.js";
import { eq, and, inArray } from "drizzle-orm";
import { calculateGroupAvailability, rankMeetingSuggestions } from "./availability.js";
import {
  createEmptySlotMatrix,
  mergeClassSchedule,
  mergeReservations,
} from "../m2/integration.js";
import { DAYS_COUNT, PERIODS_COUNT } from "../../shared/constants.js";
import type { UnifiedSlot } from "../../shared/types.js";

const m3 = new Hono();

// ─── POST /api/m3/groups ────────────────────────────────────
m3.post("/groups", async (c) => {
  const body = await c.req.json<{
    name: string;
    members: string[];
    createdBy: string;
  }>();

  const [group] = await db
    .insert(schema.groups)
    .values({
      name: body.name,
      members: body.members,
      createdBy: body.createdBy,
    })
    .returning();

  return c.json(group, 201);
});

// ─── GET /api/m3/groups/:groupId ────────────────────────────
m3.get("/groups/:groupId", async (c) => {
  const groupId = c.req.param("groupId");

  const [group] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .limit(1);

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  return c.json(group);
});

// ─── PUT /api/m3/groups/:groupId/members ────────────────────
m3.put("/groups/:groupId/members", async (c) => {
  const groupId = c.req.param("groupId");
  const body = await c.req.json<{ members: string[] }>();

  const [updated] = await db
    .update(schema.groups)
    .set({ members: body.members })
    .where(eq(schema.groups.id, groupId))
    .returning();

  if (!updated) {
    return c.json({ error: "Group not found" }, 404);
  }

  return c.json(updated);
});

// ─── GET /api/m3/groups/:groupId/availability ───────────────
m3.get("/groups/:groupId/availability", async (c) => {
  const groupId = c.req.param("groupId");

  const [group] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .limit(1);

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  const memberIds = group.members as string[];

  // Gather slot data for each member
  const memberSlots = await getMemberSlots(memberIds);

  // Get room availability
  const availableRoomsBySlot = await getRoomAvailabilityMap();

  const availability = calculateGroupAvailability(memberSlots, availableRoomsBySlot);

  return c.json({
    groupId,
    groupName: group.name,
    totalMembers: memberIds.length,
    availability,
  });
});

// ─── GET /api/m3/groups/:groupId/suggestions ────────────────
m3.get("/groups/:groupId/suggestions", async (c) => {
  const groupId = c.req.param("groupId");

  const [group] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .limit(1);

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  const memberIds = group.members as string[];

  const memberSlots = await getMemberSlots(memberIds);
  const availableRoomsBySlot = await getRoomAvailabilityMap();
  const availability = calculateGroupAvailability(memberSlots, availableRoomsBySlot);

  // Get attendance days for each member
  const memberAttendanceDays = new Map<string, number[]>();
  for (const memberId of memberIds) {
    const [profile] = await db
      .select()
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, memberId))
      .limit(1);

    if (profile) {
      memberAttendanceDays.set(memberId, profile.attendanceDays as number[]);
    } else {
      memberAttendanceDays.set(memberId, []);
    }
  }

  const suggestions = rankMeetingSuggestions(
    availability,
    memberAttendanceDays,
    memberIds
  );

  return c.json({
    groupId,
    groupName: group.name,
    suggestions,
  });
});

// ─── Helpers ────────────────────────────────────────────────

async function getMemberSlots(
  memberIds: string[]
): Promise<{ userId: string; slots: UnifiedSlot[][] }[]> {
  const result: { userId: string; slots: UnifiedSlot[][] }[] = [];
  const currentTerm = `term-${new Date().getFullYear()}`;

  for (const userId of memberIds) {
    let matrix = createEmptySlotMatrix();

    // Get member profile
    const [profile] = await db
      .select()
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, userId))
      .limit(1);

    if (profile) {
      // Merge class schedule for member's major
      const classEntries = await db
        .select({
          day: schema.scheduleEntries.day,
          period: schema.scheduleEntries.period,
          major: schema.curricula.major,
        })
        .from(schema.scheduleEntries)
        .innerJoin(
          schema.curricula,
          eq(schema.scheduleEntries.curriculumId, schema.curricula.id)
        )
        .where(
          and(
            eq(schema.scheduleEntries.termId, currentTerm),
            eq(schema.scheduleEntries.isConfirmed, true),
            eq(schema.curricula.major, profile.major)
          )
        );

      matrix = mergeClassSchedule(matrix, classEntries);
    }

    // Merge cached unified slots
    const cachedSlots = await db
      .select()
      .from(schema.unifiedSlots)
      .where(eq(schema.unifiedSlots.userId, userId));

    for (const slot of cachedSlots) {
      if (
        slot.day >= 0 && slot.day < DAYS_COUNT &&
        slot.period >= 0 && slot.period < PERIODS_COUNT &&
        matrix[slot.day][slot.period].status === "free"
      ) {
        matrix[slot.day][slot.period] = {
          day: slot.day,
          period: slot.period,
          status: slot.status as UnifiedSlot["status"],
          majorLabel: slot.majorLabel,
          isPrivate: slot.isPrivate,
          sourceModule: slot.sourceModule,
        };
      }
    }

    // Merge reservations
    const reservations = await db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.status, "confirmed"));

    const userRes = reservations.filter((r) =>
      (r.participants as string[]).includes(userId)
    );

    matrix = mergeReservations(
      matrix,
      userRes.map((r) => ({ day: r.day, period: r.period, title: r.title }))
    );

    result.push({ userId, slots: matrix });
  }

  return result;
}

async function getRoomAvailabilityMap(): Promise<Map<string, string[]>> {
  const allRooms = await db.select().from(schema.rooms);
  const currentTerm = `term-${new Date().getFullYear()}`;

  const scheduleUsage = await db
    .select()
    .from(schema.scheduleEntries)
    .where(
      and(
        eq(schema.scheduleEntries.termId, currentTerm),
        eq(schema.scheduleEntries.isConfirmed, true)
      )
    );

  const reservationUsage = await db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.status, "confirmed"));

  // Build set of occupied room-slots
  const occupied = new Set<string>();
  for (const entry of scheduleUsage) {
    occupied.add(`${entry.day}-${entry.period}-${entry.roomId}`);
  }
  for (const res of reservationUsage) {
    occupied.add(`${res.day}-${res.period}-${res.roomId}`);
  }

  // Build map: "day-period" -> [roomId, ...]
  const map = new Map<string, string[]>();
  for (let day = 0; day < DAYS_COUNT; day++) {
    for (let period = 0; period < PERIODS_COUNT; period++) {
      const available: string[] = [];
      for (const room of allRooms) {
        if (!occupied.has(`${day}-${period}-${room.id}`)) {
          available.push(room.id);
        }
      }
      map.set(`${day}-${period}`, available);
    }
  }

  return map;
}

export { m3 };
