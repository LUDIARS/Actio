/**
 * Facility Booking Routes — 施設予約 (M1 サブモジュール)
 *
 * 旧 M4 予約ロジックを M1 配下に移植。
 * 予約作成時にカレンダー予定 (personalEvent) を即時登録する。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import {
  reservationRepo,
  scheduleEntryExtRepo,
  userRepo,
  roomRepo,
  personalEventRepo,
  groupMemberRepo,
} from "../../../src/db/repository.js";
import type { CreateReservationInput } from "../../../src/shared/types.js";
import { getUserId } from "../../../src/middleware/getUserId.js";
import { logActivity } from "../../../src/activity-logger.js";
import { getPeriodTime, EVENT_NAMES } from "../../../src/shared/constants.js";
import { emitEvent } from "../../notification/core/handler.js";

const facilityBooking = new Hono();

// ─── POST /reservations ─────────────────────────────────────
facilityBooking.post("/reservations", async (c) => {
  const body = await c.req.json<CreateReservationInput & { participantGroupIds?: string[] }>();
  const createdBy = getUserId(c) || "anonymous";

  if (body.day < 0 || body.day > 6 || body.period < 0 || body.period > 10) {
    return c.json({ error: "Invalid day or period" }, 400);
  }

  // グループIDから参加者を展開
  const participants = [...(body.participants || [])];
  if (body.participantGroupIds && body.participantGroupIds.length > 0) {
    for (const gid of body.participantGroupIds) {
      const members = await groupMemberRepo.findByGroupId(gid);
      for (const m of members) {
        if (!participants.includes(m.userId)) {
          participants.push(m.userId);
        }
      }
    }
  }

  // 予約コンフリクトチェック
  const existing = await reservationRepo.findConflict(body.roomId, body.day, body.period);
  if (existing.length > 0) {
    return c.json(
      { error: "Conflict: room is already reserved at this time slot", conflictingReservation: existing[0].id },
      409
    );
  }

  // 授業スケジュールとのコンフリクトチェック
  const currentTerm = `term-${new Date().getFullYear()}`;
  const scheduleConflict = await scheduleEntryExtRepo.findConfirmedByRoomAndSlot(
    body.roomId, body.day, body.period, currentTerm
  );
  if (scheduleConflict.length > 0) {
    return c.json({ error: "Conflict: room is used for a class at this time slot" }, 409);
  }

  // 教室名を取得
  const room = await roomRepo.findById(body.roomId);
  const roomName = room?.name || body.roomId;

  const reservationId = uuidv4();

  // カレンダー予定を作成
  const calendarEventId = uuidv4();
  const periodTime = getPeriodTime(body.period);

  await personalEventRepo.create({
    id: calendarEventId,
    userId: createdBy,
    title: body.title,
    description: `施設予約: ${body.title}`,
    day: body.day,
    period: body.period,
    duration: 1,
    startTime: periodTime.start,
    endTime: periodTime.end,
    eventType: "reservation",
    isPrivate: false,
  });

  // 予約レコード作成
  const reservation = await reservationRepo.create({
    id: reservationId,
    groupId: body.groupId,
    title: body.title,
    day: body.day,
    period: body.period,
    roomId: body.roomId,
    createdBy,
    participants,
    status: "confirmed",
    note: body.note || "",
    version: 1,
    calendarEventId,
  });

  const user = await userRepo.findById(createdBy);
  logActivity(createdBy, user?.name || "Unknown", "施設予約作成", `予約「${body.title}」が追加されました（教室: ${roomName}）`);

  // 通知を送信
  await emitEvent(EVENT_NAMES.RESERVATION_CREATED, {
    title: body.title,
    day: body.day,
    period: body.period + 1,
    room: roomName,
    participants,
    createdBy,
  });

  return c.json({ ...reservation, roomName, calendarEventId }, 201);
});

// ─── GET /reservations ──────────────────────────────────────
facilityBooking.get("/reservations", async (c) => {
  const groupId = c.req.query("groupId");

  const results = groupId
    ? await reservationRepo.findByGroupId(groupId)
    : await reservationRepo.findAll();

  // 教室名を一括取得
  const rooms = await roomRepo.findAll();
  const roomMap = new Map(rooms.map((r: { id: string; name: string }) => [r.id, r.name]));

  const publicResults = results.map((r: typeof results[number]) => ({
    id: r.id,
    groupId: r.groupId,
    title: r.title,
    day: r.day,
    period: r.period,
    roomId: r.roomId,
    roomName: roomMap.get(r.roomId) || r.roomId,
    createdBy: r.createdBy,
    participants: r.participants,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
    calendarEventId: (r as any).calendarEventId || null,
  }));

  return c.json({ reservations: publicResults });
});

// ─── GET /reservations/:id ──────────────────────────────────
facilityBooking.get("/reservations/:id", async (c) => {
  const id = c.req.param("id");
  const reservation = await reservationRepo.findById(id);
  if (!reservation) {
    return c.json({ error: "Reservation not found" }, 404);
  }
  const room = await roomRepo.findById(reservation.roomId);
  return c.json({ ...reservation, roomName: room?.name || reservation.roomId });
});

// ─── PUT /reservations/:id ──────────────────────────────────
facilityBooking.put("/reservations/:id", async (c) => {
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

  const current = await reservationRepo.findById(id);
  if (!current) {
    return c.json({ error: "Reservation not found" }, 404);
  }

  if (current.version !== body.version) {
    return c.json(
      { error: "Version conflict: reservation was modified by another user", currentVersion: current.version },
      409
    );
  }

  if (current.status === "cancelled") {
    return c.json({ error: "Cannot update a cancelled reservation" }, 400);
  }

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

  const newTitle = body.title ?? current.title;
  const newParticipants = body.participants ?? current.participants;
  const updated = await reservationRepo.update(id, {
    title: newTitle,
    day: newDay,
    period: newPeriod,
    roomId: newRoomId,
    participants: newParticipants,
    note: body.note ?? current.note,
    version: current.version + 1,
    updatedAt: new Date(),
  });

  // カレンダー予定も更新
  const calendarEventId = (current as any).calendarEventId;
  if (calendarEventId) {
    const periodTime = getPeriodTime(newPeriod);
    await personalEventRepo.update(calendarEventId, {
      title: newTitle,
      day: newDay,
      period: newPeriod,
      startTime: periodTime.start,
      endTime: periodTime.end,
      updatedAt: new Date(),
    });
  }

  const userId = getUserId(c) || "anonymous";
  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "施設予約更新", `予約「${updated?.title || id}」が更新されました`);

  // 通知を送信
  const room = await roomRepo.findById(newRoomId);
  const roomName = room?.name || newRoomId;
  await emitEvent(EVENT_NAMES.RESERVATION_UPDATED, {
    title: newTitle,
    day: newDay,
    period: newPeriod + 1,
    room: roomName,
    participants: newParticipants,
    updatedBy: userId,
  });

  return c.json({ ...updated, roomName });
});

// ─── DELETE /reservations/:id ───────────────────────────────
facilityBooking.delete("/reservations/:id", async (c) => {
  const id = c.req.param("id");
  const current = await reservationRepo.findById(id);
  if (!current) {
    return c.json({ error: "Reservation not found" }, 404);
  }

  const cancelled = await reservationRepo.update(id, {
    status: "cancelled",
    updatedAt: new Date(),
  });

  // カレンダー予定を連動削除
  const calendarEventId = (current as any).calendarEventId;
  if (calendarEventId) {
    await personalEventRepo.deleteById(calendarEventId);
  }

  // 通知を送信
  const room = await roomRepo.findById(current.roomId);
  const roomName = room?.name || current.roomId;
  const userId = getUserId(c) || "anonymous";
  await emitEvent(EVENT_NAMES.RESERVATION_CANCELLED, {
    title: current.title,
    day: current.day,
    period: current.period + 1,
    room: roomName,
    participants: current.participants,
    cancelledBy: userId,
  });

  return c.json({ message: "Reservation cancelled", reservation: cancelled });
});

// ─── GET /rooms/availability ────────────────────────────────
facilityBooking.get("/rooms/availability", async (c) => {
  const rooms = await roomRepo.findAll();
  const reservations = await reservationRepo.findAll();
  const confirmedReservations = reservations.filter((r: { status: string }) => r.status === "confirmed");

  const currentTerm = `term-${new Date().getFullYear()}`;

  const roomOccupied = new Map<string, Set<string>>();
  for (const r of confirmedReservations) {
    const key = r.roomId;
    if (!roomOccupied.has(key)) roomOccupied.set(key, new Set());
    roomOccupied.get(key)!.add(`${r.day}-${r.period}`);
  }

  for (const room of rooms) {
    const classSchedule = await scheduleEntryExtRepo.findConfirmedByRoom(room.id, currentTerm);
    if (!roomOccupied.has(room.id)) roomOccupied.set(room.id, new Set());
    for (const entry of classSchedule) {
      roomOccupied.get(room.id)!.add(`${entry.day}-${entry.period}`);
    }
  }

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

// ─── GET /rooms/:roomId/schedule ────────────────────────────
facilityBooking.get("/rooms/:roomId/schedule", async (c) => {
  const roomId = c.req.param("roomId");
  const roomReservations = await reservationRepo.findConfirmedByRoom(roomId);
  const currentTerm = `term-${new Date().getFullYear()}`;
  const classSchedule = await scheduleEntryExtRepo.findConfirmedByRoom(roomId, currentTerm);

  return c.json({ roomId, reservations: roomReservations, classSchedule });
});

export { facilityBooking };
