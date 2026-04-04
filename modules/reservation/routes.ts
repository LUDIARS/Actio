import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { reservationRepo, scheduleEntryExtRepo, userRepo, roomRepo } from "../../src/db/repository.js";
import type { CreateReservationInput } from "../../src/shared/types.js";
import { getUserId } from "../../src/middleware/getUserId.js";
import { logActivity } from "../../src/activity-logger.js";

const m4 = new Hono();

// ─── POST /api/m4/reservations ──────────────────────────────
m4.post("/reservations", async (c) => {
  const body = await c.req.json<CreateReservationInput>();
  const createdBy = getUserId(c) || "anonymous";

  // Validate day/period
  if (body.day < 0 || body.day > 6 || body.period < 0 || body.period > 10) {
    return c.json({ error: "Invalid day or period" }, 400);
  }

  // Optimistic lock: check for conflicts
  const existing = await reservationRepo.findConflict(body.roomId, body.day, body.period);

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
  const scheduleConflict = await scheduleEntryExtRepo.findConfirmedByRoomAndSlot(
    body.roomId, body.day, body.period, currentTerm
  );

  if (scheduleConflict.length > 0) {
    return c.json(
      { error: "Conflict: room is used for a class at this time slot" },
      409
    );
  }

  const reservation = await reservationRepo.create({
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
  });

  const user = await userRepo.findById(createdBy);
  logActivity(createdBy, user?.name || "Unknown", "予約作成", `予約「${body.title}」が追加されました（教室: ${body.roomId}）`);

  return c.json(reservation, 201);
});

// ─── GET /api/m4/reservations ───────────────────────────────
m4.get("/reservations", async (c) => {
  const groupId = c.req.query("groupId");

  const results = groupId
    ? await reservationRepo.findByGroupId(groupId)
    : await reservationRepo.findAll();

  // Public view: exclude private member data
  const publicResults = results.map((r) => ({
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
  const reservation = await reservationRepo.findById(id);

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
  const current = await reservationRepo.findById(id);

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
    const conflict = await reservationRepo.findConflict(newRoomId, newDay, newPeriod);
    const hasConflict = conflict.some((r) => r.id !== id);
    if (hasConflict) {
      return c.json({ error: "Conflict: room is already reserved" }, 409);
    }
  }

  const updated = await reservationRepo.update(id, {
    title: body.title ?? current.title,
    day: newDay,
    period: newPeriod,
    roomId: newRoomId,
    participants: body.participants ?? current.participants,
    note: body.note ?? current.note,
    version: current.version + 1,
    updatedAt: new Date(),
  });

  const userId = getUserId(c) || "anonymous";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "予約更新", `予約「${updated?.title || id}」が更新されました`);

  return c.json(updated);
});

// ─── DELETE /api/m4/reservations/:id ────────────────────────
m4.delete("/reservations/:id", async (c) => {
  const id = c.req.param("id");
  const current = await reservationRepo.findById(id);

  if (!current) {
    return c.json({ error: "Reservation not found" }, 404);
  }

  const cancelled = await reservationRepo.update(id, {
    status: "cancelled",
    updatedAt: new Date(),
  });

  return c.json({
    message: "Reservation cancelled",
    reservation: cancelled,
  });
});

// ─── GET /api/m4/rooms/availability ──────────────────────────
// 全教室の空き状況を返す (各曜日×コマで予約済み・授業中の教室を除外)
// NOTE: この静的パスは /rooms/:roomId/schedule より前に定義する必要がある
m4.get("/rooms/availability", async (c) => {
  const rooms = await roomRepo.findAll();
  const reservations = await reservationRepo.findAll();
  const confirmedReservations = reservations.filter((r: { status: string }) => r.status === "confirmed");

  const currentTerm = `term-${new Date().getFullYear()}`;

  // 各教室の使用中スロットを集める
  const roomOccupied = new Map<string, Set<string>>();
  for (const r of confirmedReservations) {
    const key = r.roomId;
    if (!roomOccupied.has(key)) roomOccupied.set(key, new Set());
    roomOccupied.get(key)!.add(`${r.day}-${r.period}`);
  }

  // 授業の使用中スロットも追加
  for (const room of rooms) {
    const classSchedule = await scheduleEntryExtRepo.findConfirmedByRoom(room.id, currentTerm);
    if (!roomOccupied.has(room.id)) roomOccupied.set(room.id, new Set());
    for (const entry of classSchedule) {
      roomOccupied.get(room.id)!.add(`${entry.day}-${entry.period}`);
    }
  }

  // 各教室の空き状況を構築
  const availability = rooms.map((room: { id: string; name: string; capacity: number; type: string }) => {
    const occupied = roomOccupied.get(room.id) || new Set<string>();
    const freeSlots: Array<{ day: number; period: number }> = [];
    for (let d = 0; d < 7; d++) {
      for (let p = 0; p < 11; p++) {
        if (!occupied.has(`${d}-${p}`)) {
          freeSlots.push({ day: d, period: p });
        }
      }
    }
    return {
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      type: room.type,
      freeSlots,
      occupiedCount: occupied.size,
    };
  });

  return c.json({ rooms: availability });
});

// ─── GET /api/m4/rooms/:roomId/schedule ─────────────────────
m4.get("/rooms/:roomId/schedule", async (c) => {
  const roomId = c.req.param("roomId");

  const roomReservations = await reservationRepo.findConfirmedByRoom(roomId);

  // Also get class schedule
  const currentTerm = `term-${new Date().getFullYear()}`;
  const classSchedule = await scheduleEntryExtRepo.findConfirmedByRoom(roomId, currentTerm);

  return c.json({
    roomId,
    reservations: roomReservations,
    classSchedule,
  });
});

export { m4 };
