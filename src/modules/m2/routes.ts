import { Hono } from "hono";
import { db, schema } from "../../db/connection.js";
import { eq, and, not } from "drizzle-orm";
import {
  createEmptySlotMatrix,
  mergeClassSchedule,
  mergePersonalEvents,
  mergeSchoolEvents,
  mergeReservations,
  applyPrivacyFilter,
  calculateAttendanceDays,
} from "./integration.js";
import type { UnifiedSlot } from "../../shared/types.js";
import { DAYS_COUNT, PERIODS_COUNT } from "../../shared/constants.js";

const m2 = new Hono();

// ─── GET /api/m2/members/:userId/slots ──────────────────────
m2.get("/members/:userId/slots", async (c) => {
  const userId = c.req.param("userId");
  const requesterId = c.req.header("X-User-Id") || userId;
  const isOwner = requesterId === userId;

  // Start with empty matrix
  let matrix = createEmptySlotMatrix();

  // Get member profile
  const profile = await db
    .select()
    .from(schema.memberProfiles)
    .where(eq(schema.memberProfiles.userId, userId))
    .limit(1);

  if (profile.length === 0) {
    return c.json({ error: "Member not found" }, 404);
  }

  const member = profile[0];

  // Merge M1 class schedule
  const currentTerm = `term-${new Date().getFullYear()}`;
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
        eq(schema.curricula.major, member.major)
      )
    );

  matrix = mergeClassSchedule(matrix, classEntries);

  // Merge cached unified slots (personal events, etc.)
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

  // Merge M4 reservations
  const activeReservations = await db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.status, "confirmed"));

  const userReservations = activeReservations.filter((r) =>
    (r.participants as string[]).includes(userId)
  );

  matrix = mergeReservations(
    matrix,
    userReservations.map((r) => ({
      day: r.day,
      period: r.period,
      title: r.title,
    }))
  );

  // Apply privacy filter
  const filteredMatrix = applyPrivacyFilter(matrix, isOwner);

  return c.json({
    userId,
    slots: filteredMatrix,
  });
});

// ─── GET /api/m2/members/:userId/attendance ─────────────────
m2.get("/members/:userId/attendance", async (c) => {
  const userId = c.req.param("userId");

  const profile = await db
    .select()
    .from(schema.memberProfiles)
    .where(eq(schema.memberProfiles.userId, userId))
    .limit(1);

  if (profile.length === 0) {
    return c.json({ error: "Member not found" }, 404);
  }

  return c.json({
    userId,
    attendanceDays: profile[0].attendanceDays,
  });
});

// ─── POST /api/m2/sync/gcal ────────────────────────────────
m2.post("/sync/gcal", async (c) => {
  // Placeholder for Google Calendar sync
  // In production, this would use Google Calendar API with OAuth
  return c.json({
    message: "Google Calendar sync triggered",
    status: "pending",
    note: "Google Calendar API integration requires OAuth setup",
  });
});

// ─── GET /api/m2/rooms/availability ─────────────────────────
m2.get("/rooms/availability", async (c) => {
  const day = parseInt(c.req.query("day") || "-1", 10);
  const period = parseInt(c.req.query("period") || "-1", 10);

  // Get all rooms
  const allRooms = await db.select().from(schema.rooms);

  // Get schedule entries for the current term
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

  // Get confirmed reservations
  const reservationUsage = await db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.status, "confirmed"));

  // Build room availability matrix
  const roomAvailability = allRooms.map((room) => {
    const availability: boolean[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array(PERIODS_COUNT).fill(true)
    );

    for (const entry of scheduleUsage) {
      if (entry.roomId === room.id) {
        availability[entry.day][entry.period] = false;
      }
    }

    for (const res of reservationUsage) {
      if (res.roomId === room.id) {
        availability[res.day][res.period] = false;
      }
    }

    return {
      room: { id: room.id, name: room.name, type: room.type, capacity: room.capacity },
      availability:
        day >= 0 && period >= 0
          ? availability[day]?.[period] ?? false
          : availability,
    };
  });

  // If specific day/period requested, filter to available rooms only
  if (day >= 0 && period >= 0) {
    const available = roomAvailability.filter((r) => r.availability === true);
    return c.json({ day, period, availableRooms: available.map((r) => r.room) });
  }

  return c.json({ rooms: roomAvailability });
});

export { m2 };
