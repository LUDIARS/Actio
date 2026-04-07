/**
 * WS Command Handlers — Facility Booking module
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  reservationRepo,
  scheduleEntryExtRepo,
  userRepo,
  roomRepo,
  personalEventRepo,
  groupMemberRepo,
} from "../../db/repository.js";
import { getPeriodTime, EVENT_NAMES } from "../../shared/constants.js";
import { logActivity } from "../../activity-logger.js";
import { emitEvent } from "../../../modules/notification/core/handler.js";
import { broadcastToUsers } from "../broadcast.js";

// ── facility.create_reservation ──

interface CreateReservationPayload {
  groupId: string;
  title: string;
  day: number;
  period: number;
  roomId: string;
  participants?: string[];
  participantGroupIds?: string[];
  note?: string;
}

registerCommand("facility", "create_reservation", async (userId, payload) => {
  const body = payload as CreateReservationPayload;

  if (body.day < 0 || body.day > 6 || body.period < 0 || body.period > 10) {
    throw new Error("Invalid day or period");
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
    throw new Error("Conflict: room is already reserved at this time slot");
  }

  // 授業スケジュールとのコンフリクトチェック
  const currentTerm = `term-${new Date().getFullYear()}`;
  const scheduleConflict = await scheduleEntryExtRepo.findConfirmedByRoomAndSlot(
    body.roomId, body.day, body.period, currentTerm,
  );
  if (scheduleConflict.length > 0) {
    throw new Error("Conflict: room is used for a class at this time slot");
  }

  const room = await roomRepo.findById(body.roomId);
  const roomName = room?.name || body.roomId;

  const reservationId = uuidv4();

  // カレンダー予定を作成
  const calendarEventId = uuidv4();
  const periodTime = getPeriodTime(body.period);

  await personalEventRepo.create({
    id: calendarEventId,
    userId,
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
    createdBy: userId,
    participants,
    status: "confirmed",
    note: body.note || "",
    version: 1,
    calendarEventId,
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "施設予約作成", `予約「${body.title}」が追加されました（教室: ${roomName}）`);

  await emitEvent(EVENT_NAMES.RESERVATION_CREATED, {
    title: body.title,
    day: body.day,
    period: body.period + 1,
    room: roomName,
    participants,
    createdBy: userId,
  });

  broadcastToUsers(participants, "facility.reservation_created", {
    reservationId,
    title: body.title,
    day: body.day,
    period: body.period,
    roomName,
    createdBy: user?.name || "Unknown",
  }, userId);

  return { ...reservation, roomName, calendarEventId };
});

// ── facility.update_reservation ──

interface UpdateReservationPayload {
  id: string;
  title?: string;
  day?: number;
  period?: number;
  roomId?: string;
  participants?: string[];
  note?: string;
  version: number;
}

registerCommand("facility", "update_reservation", async (userId, payload) => {
  const body = payload as UpdateReservationPayload;
  if (!body.id) throw new Error("id is required");

  const current = await reservationRepo.findById(body.id);
  if (!current) throw new Error("Reservation not found");

  if (current.version !== body.version) {
    throw new Error("Version conflict: reservation was modified by another user");
  }

  if (current.status === "cancelled") {
    throw new Error("Cannot update a cancelled reservation");
  }

  const newDay = body.day ?? current.day;
  const newPeriod = body.period ?? current.period;
  const newRoomId = body.roomId ?? current.roomId;

  if (newDay !== current.day || newPeriod !== current.period || newRoomId !== current.roomId) {
    const conflict = await reservationRepo.findConflict(newRoomId, newDay, newPeriod);
    const hasConflict = conflict.some((r) => r.id !== body.id);
    if (hasConflict) {
      throw new Error("Conflict: room is already reserved");
    }
  }

  const newTitle = body.title ?? current.title;
  const newParticipants = body.participants ?? current.participants;
  const updated = await reservationRepo.update(body.id, {
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
  const calendarEventId = (current as Record<string, unknown>).calendarEventId as string | undefined;
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

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "施設予約更新", `予約「${updated?.title || body.id}」が更新されました`);

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

  broadcastToUsers(newParticipants, "facility.reservation_updated", {
    reservationId: body.id,
    title: newTitle,
    day: newDay,
    period: newPeriod,
    roomName,
    updatedBy: user?.name || "Unknown",
  }, userId);

  return { ...updated, roomName };
});

// ── facility.cancel_reservation ──

interface CancelReservationPayload {
  id: string;
}

registerCommand("facility", "cancel_reservation", async (userId, payload) => {
  const body = payload as CancelReservationPayload;
  if (!body.id) throw new Error("id is required");

  const current = await reservationRepo.findById(body.id);
  if (!current) throw new Error("Reservation not found");

  const cancelled = await reservationRepo.update(body.id, {
    status: "cancelled",
    updatedAt: new Date(),
  });

  // カレンダー予定を連動削除
  const calendarEventId = (current as Record<string, unknown>).calendarEventId as string | undefined;
  if (calendarEventId) {
    await personalEventRepo.deleteById(calendarEventId);
  }

  const room = await roomRepo.findById(current.roomId);
  const roomName = room?.name || current.roomId;
  await emitEvent(EVENT_NAMES.RESERVATION_CANCELLED, {
    title: current.title,
    day: current.day,
    period: current.period + 1,
    room: roomName,
    participants: current.participants,
    cancelledBy: userId,
  });

  broadcastToUsers(current.participants as string[], "facility.reservation_cancelled", {
    reservationId: body.id,
    title: current.title,
    day: current.day,
    period: current.period,
    roomName,
    cancelledBy: userId,
  }, userId);

  return { message: "Reservation cancelled", reservation: cancelled };
});
