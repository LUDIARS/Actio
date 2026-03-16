import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";
import type { CreateReservationInput } from "../../src/shared/types.js";

const m4 = new Hono();

// ─── POST /api/m4/reservations ──────────────────────────────
m4.post("/reservations", async (c) => {
  const body = await c.req.json<CreateReservationInput>();
  const createdBy = c.req.header("X-User-Id") || "anonymous";

  // Validate day/period
  if (body.day < 0 || body.day > 6 || body.period < 0 || body.period > 10) {
    return c.json({ error: "Invalid day or period" }, 400);
  }

  // Optimistic lock: check for conflicts
  const existing = db
    .select()
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.roomId, body.roomId),
        eq(schema.reservations.day, body.day),
        eq(schema.reservations.period, body.period),
        eq(schema.reservations.status, "confirmed")
      )
    )
    .limit(1)
    .all();

  if (existing.length > 0) {
    return c.json(
      {
        error: "Conflict: room is already reserved at this time slot",
        conflictingReservation: existing[0].id,
      },
      409
    );
  }

  // Also check against confirmed schedule entries
  const currentTerm = `term-${new Date().getFullYear()}`;
  const scheduleConflict = db
    .select()
    .from(schema.scheduleEntries)
    .where(
      and(
        eq(schema.scheduleEntries.roomId, body.roomId),
        eq(schema.scheduleEntries.day, body.day),
        eq(schema.scheduleEntries.period, body.period),
        eq(schema.scheduleEntries.termId, currentTerm),
        eq(schema.scheduleEntries.isConfirmed, true)
      )
    )
    .limit(1)
    .all();

  if (scheduleConflict.length > 0) {
    return c.json(
      { error: "Conflict: room is used for a class at this time slot" },
      409
    );
  }

  const [reservation] = db
    .insert(schema.reservations)
    .values({
      id: uuidv4(),
      groupId: body.groupId,
      title: body.title,
      day: body.day,
      period: body.period,
      roomId: body.roomId,
      createdBy,
      participants: body.participants,
      status: "confirmed",
      note: body.note || "",
      version: 1,
    })
    .returning().all();

  return c.json(reservation, 201);
});

// ─── GET /api/m4/reservations ───────────────────────────────
m4.get("/reservations", async (c) => {
  const groupId = c.req.query("groupId");

  const results = groupId
    ? db
        .select()
        .from(schema.reservations)
        .where(eq(schema.reservations.groupId, groupId))
        .all()
    : db.select().from(schema.reservations).all();

  // Public view: exclude private member data
  const publicResults = results.map((r: any) => ({
    id: r.id,
    groupId: r.groupId,
    title: r.title,
    day: r.day,
    period: r.period,
    roomId: r.roomId,
    createdBy: r.createdBy,
    participants: r.participants,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
  }));

  return c.json({ reservations: publicResults });
});

// ─── GET /api/m4/reservations/:id ───────────────────────────
m4.get("/reservations/:id", async (c) => {
  const id = c.req.param("id");

  const [reservation] = db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .limit(1)
    .all();

  if (!reservation) {
    return c.json({ error: "Reservation not found" }, 404);
  }

  return c.json(reservation);
});

// ─── PUT /api/m4/reservations/:id ───────────────────────────
m4.put("/reservations/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    day?: number;
    period?: number;
    roomId?: string;
    participants?: string[];
    note?: string;
    version: number;
  }>();

  // Optimistic lock: check version
  const [current] = db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .limit(1)
    .all();

  if (!current) {
    return c.json({ error: "Reservation not found" }, 404);
  }

  if (current.version !== body.version) {
    return c.json(
      {
        error: "Version conflict: reservation was modified by another user",
        currentVersion: current.version,
      },
      409
    );
  }

  if (current.status === "cancelled") {
    return c.json({ error: "Cannot update a cancelled reservation" }, 400);
  }

  // If changing room/slot, check for conflicts
  const newDay = body.day ?? current.day;
  const newPeriod = body.period ?? current.period;
  const newRoomId = body.roomId ?? current.roomId;

  if (newDay !== current.day || newPeriod !== current.period || newRoomId !== current.roomId) {
    const conflict = db
      .select()
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.roomId, newRoomId),
          eq(schema.reservations.day, newDay),
          eq(schema.reservations.period, newPeriod),
          eq(schema.reservations.status, "confirmed")
        )
      )
      .limit(1)
      .all();

    const hasConflict = conflict.some((r: any) => r.id !== id);
    if (hasConflict) {
      return c.json({ error: "Conflict: room is already reserved" }, 409);
    }
  }

  const [updated] = db
    .update(schema.reservations)
    .set({
      title: body.title ?? current.title,
      day: newDay,
      period: newPeriod,
      roomId: newRoomId,
      participants: body.participants ?? current.participants,
      note: body.note ?? current.note,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(schema.reservations.id, id))
    .returning().all();

  return c.json(updated);
});

// ─── DELETE /api/m4/reservations/:id ────────────────────────
m4.delete("/reservations/:id", async (c) => {
  const id = c.req.param("id");

  const [current] = db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .limit(1)
    .all();

  if (!current) {
    return c.json({ error: "Reservation not found" }, 404);
  }

  const [cancelled] = db
    .update(schema.reservations)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(schema.reservations.id, id))
    .returning().all();

  return c.json({
    message: "Reservation cancelled",
    reservation: cancelled,
  });
});

// ─── GET /api/m4/rooms/:roomId/schedule ─────────────────────
m4.get("/rooms/:roomId/schedule", async (c) => {
  const roomId = c.req.param("roomId");

  const roomReservations = db
    .select()
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.roomId, roomId),
        eq(schema.reservations.status, "confirmed")
      )
    )
    .all();

  // Also get class schedule
  const currentTerm = `term-${new Date().getFullYear()}`;
  const classSchedule = db
    .select()
    .from(schema.scheduleEntries)
    .where(
      and(
        eq(schema.scheduleEntries.roomId, roomId),
        eq(schema.scheduleEntries.termId, currentTerm),
        eq(schema.scheduleEntries.isConfirmed, true)
      )
    )
    .all();

  return c.json({
    roomId,
    reservations: roomReservations,
    classSchedule,
  });
});

export { m4 };
