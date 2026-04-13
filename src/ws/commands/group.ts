/**
 * WS Command Handlers — Group module
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  groupRepo,
  groupMemberRepo,
  groupScheduleRepo,
  groupEventRepo,
} from "../../db/repository.js";
import { getUserInfo } from "../../auth/user-info.js";
import { logActivity } from "../../activity-logger.js";
import { broadcastToGroupMembers } from "../broadcast.js";

// ── group.create ──

interface CreateGroupPayload {
  name: string;
  description?: string;
}

registerCommand("group", "create", async (userId, payload) => {
  const body = payload as CreateGroupPayload;
  if (!body.name) throw new Error("name is required");

  const groupId = uuidv4();
  const now = new Date();

  await groupRepo.create({
    id: groupId,
    name: body.name,
    description: body.description || null,
    createdBy: userId,
    createdAt: now,
  });

  await groupMemberRepo.create({
    id: uuidv4(),
    groupId,
    userId,
    role: "owner",
    joinedAt: now,
  });

  const user = await getUserInfo(userId);
  logActivity(userId, user.name || "Unknown", "グループ作成", `グループ「${body.name}」が追加されました`);

  return { groupId, message: "Group created" };
});

// ── group.join ──

interface GroupIdPayload {
  groupId: string;
}

registerCommand("group", "join", async (userId, payload) => {
  const body = payload as GroupIdPayload;
  if (!body.groupId) throw new Error("groupId is required");

  const group = await groupRepo.findById(body.groupId);
  if (!group) throw new Error("Group not found");

  const existing = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  if (existing) throw new Error("Already a member");

  await groupMemberRepo.create({
    id: uuidv4(),
    groupId: body.groupId,
    userId,
    role: "member",
    joinedAt: new Date(),
  });

  const user = await getUserInfo(userId);
  logActivity(userId, user.name || "Unknown", "グループ参加", `グループ「${group.name}」に参加しました`);

  await broadcastToGroupMembers(body.groupId, "group.member_joined", {
    groupId: body.groupId,
    userId,
    userName: user.name || "Unknown",
  }, userId);

  return { message: "Joined group" };
});

// ── group.leave ──

registerCommand("group", "leave", async (userId, payload) => {
  const body = payload as GroupIdPayload;
  if (!body.groupId) throw new Error("groupId is required");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  if (!membership) throw new Error("Not a member");

  await groupMemberRepo.deleteByGroupAndUser(body.groupId, userId);

  const group = await groupRepo.findById(body.groupId);
  const user = await getUserInfo(userId);
  logActivity(userId, user.name || "Unknown", "グループ脱退", `グループ「${group?.name || body.groupId}」から脱退しました`);

  await broadcastToGroupMembers(body.groupId, "group.member_left", {
    groupId: body.groupId,
    userId,
    userName: user.name || "Unknown",
  }, userId);

  return { message: "Left group" };
});

// ── group.invite ──

interface InvitePayload {
  groupId: string;
  targetUserId: string;
  systemRole?: string;
}

registerCommand("group", "invite", async (userId, payload) => {
  const body = payload as InvitePayload;
  if (!body.groupId) throw new Error("groupId is required");
  if (!body.targetUserId) throw new Error("targetUserId is required");

  const group = await groupRepo.findById(body.groupId);
  if (!group) throw new Error("Group not found");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  const systemRole = body.systemRole || "";
  if (systemRole !== "admin" && membership?.role !== "owner" && membership?.role !== "leader") {
    throw new Error("グループリーダーまたは管理者のみ招待できます");
  }

  const targetUser = await getUserInfo(body.targetUserId);

  const existing = await groupMemberRepo.findByGroupAndUser(body.groupId, body.targetUserId);
  if (existing) throw new Error("既にグループのメンバーです");

  await groupMemberRepo.create({
    id: uuidv4(),
    groupId: body.groupId,
    userId: body.targetUserId,
    role: "member",
    joinedAt: new Date(),
  });

  const inviter = await getUserInfo(userId);
  logActivity(userId, inviter.name || "Unknown", "グループ招待", `「${targetUser.name}」をグループ「${group.name}」に招待しました`);

  await broadcastToGroupMembers(body.groupId, "group.member_invited", {
    groupId: body.groupId,
    invitedUserId: body.targetUserId,
    invitedUserName: targetUser.name,
    invitedBy: inviter.name || "Unknown",
  }, userId);

  return { message: `${targetUser.name} をグループに招待しました` };
});

// ── group.update_member_role ──

interface UpdateMemberRolePayload {
  groupId: string;
  targetUserId: string;
  role: string;
  systemRole?: string;
}

registerCommand("group", "update_member_role", async (userId, payload) => {
  const body = payload as UpdateMemberRolePayload;
  if (!body.groupId) throw new Error("groupId is required");
  if (!body.targetUserId) throw new Error("targetUserId is required");

  const group = await groupRepo.findById(body.groupId);
  if (!group) throw new Error("Group not found");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  const systemRole = body.systemRole || "";
  if (systemRole !== "admin" && membership?.role !== "owner" && membership?.role !== "leader") {
    throw new Error("グループリーダーまたは管理者のみロールを変更できます");
  }

  const validRoles = ["leader", "member"];
  if (!validRoles.includes(body.role)) {
    throw new Error(`role は ${validRoles.join("/")} のいずれかを指定してください`);
  }

  const targetMember = await groupMemberRepo.findByGroupAndUser(body.groupId, body.targetUserId);
  if (!targetMember) throw new Error("対象メンバーが見つかりません");

  if (targetMember.role === "owner") {
    throw new Error("オーナーのロールは変更できません");
  }

  await groupMemberRepo.updateRole(body.groupId, body.targetUserId, body.role);

  const targetUser = await getUserInfo(body.targetUserId);
  const actor = await getUserInfo(userId);
  logActivity(userId, actor.name || "Unknown", "ロール変更", `「${targetUser.name || body.targetUserId}」のロールを「${body.role}」に変更しました（グループ: ${group.name}）`);

  return { message: `ロールを ${body.role} に変更しました` };
});

// ── group.create_schedule ──

interface CreateSchedulePayload {
  groupId: string;
  title: string;
  day: number;
  period: number;
  duration?: number;
  scheduleType?: string;
  date?: string;
}

registerCommand("group", "create_schedule", async (userId, payload) => {
  const body = payload as CreateSchedulePayload;
  if (!body.groupId) throw new Error("groupId is required");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  if (!membership) throw new Error("Not a member");

  if (!body.title || body.day == null || body.period == null) {
    throw new Error("title, day, period are required");
  }
  if (body.day < 0 || body.day > 6) throw new Error("day must be 0-6");
  if (body.period < 0 || body.period > 10) throw new Error("period must be 0-10");

  const id = uuidv4();

  await groupScheduleRepo.create({
    id,
    groupId: body.groupId,
    title: body.title,
    day: body.day,
    period: body.period,
    duration: body.duration || 1,
    date: body.date || null,
    scheduleType: body.scheduleType || "recurring",
    createdBy: userId,
    createdAt: new Date(),
  });

  const created = await groupScheduleRepo.findById(id);

  const user = await getUserInfo(userId);
  logActivity(userId, user.name || "Unknown", "グループ予定追加", `グループ予定「${body.title}」が追加されました`);

  await broadcastToGroupMembers(body.groupId, "group.schedule_created", {
    groupId: body.groupId,
    schedule: created,
    createdBy: user.name || "Unknown",
  }, userId);

  return { schedule: created };
});

// ── group.create_event ──

interface CreateGroupEventPayload {
  groupId: string;
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  allDay?: boolean;
  period?: number;
  duration?: number;
  eventType?: string;
}

registerCommand("group", "create_event", async (userId, payload) => {
  const body = payload as CreateGroupEventPayload;
  if (!body.groupId) throw new Error("groupId is required");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  if (!membership) throw new Error("Not a member");

  if (!body.title || !body.date) {
    throw new Error("title and date are required");
  }

  const id = uuidv4();
  await groupEventRepo.create({
    id,
    groupId: body.groupId,
    title: body.title,
    description: body.description || null,
    date: body.date,
    endDate: body.endDate || null,
    allDay: body.allDay !== false,
    period: body.period ?? null,
    duration: body.duration ?? 1,
    eventType: body.eventType || "event",
    createdBy: userId,
  });

  const created = await groupEventRepo.findById(id);

  const user = await getUserInfo(userId);
  logActivity(userId, user.name || "Unknown", "グループ予定追加", `グループ個別予定「${body.title}」が追加されました`);

  await broadcastToGroupMembers(body.groupId, "group.event_created", {
    groupId: body.groupId,
    event: created,
    createdBy: user.name || "Unknown",
  }, userId);

  return { event: created };
});

// ── group.update_event ──

interface UpdateGroupEventPayload {
  groupId: string;
  eventId: string;
  title?: string;
  description?: string;
  date?: string;
  endDate?: string;
  allDay?: boolean;
  period?: number;
  duration?: number;
  eventType?: string;
}

registerCommand("group", "update_event", async (userId, payload) => {
  const body = payload as UpdateGroupEventPayload;
  if (!body.groupId) throw new Error("groupId is required");
  if (!body.eventId) throw new Error("eventId is required");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  if (!membership) throw new Error("Not a member");

  const existing = await groupEventRepo.findById(body.eventId);
  if (!existing || existing.groupId !== body.groupId) {
    throw new Error("Event not found");
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.date !== undefined) updates.date = body.date;
  if (body.endDate !== undefined) updates.endDate = body.endDate;
  if (body.allDay !== undefined) updates.allDay = body.allDay;
  if (body.period !== undefined) updates.period = body.period;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined) updates.eventType = body.eventType;

  await groupEventRepo.update(body.eventId, updates);
  const updated = await groupEventRepo.findById(body.eventId);

  await broadcastToGroupMembers(body.groupId, "group.event_updated", {
    groupId: body.groupId,
    event: updated,
  }, userId);

  return { event: updated };
});

// ── group.delete_event ──

interface DeleteGroupEventPayload {
  groupId: string;
  eventId: string;
}

registerCommand("group", "delete_event", async (userId, payload) => {
  const body = payload as DeleteGroupEventPayload;
  if (!body.groupId) throw new Error("groupId is required");
  if (!body.eventId) throw new Error("eventId is required");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  if (!membership) throw new Error("Not a member");

  const existing = await groupEventRepo.findById(body.eventId);
  if (!existing || existing.groupId !== body.groupId) {
    throw new Error("Event not found");
  }

  await groupEventRepo.deleteById(body.eventId);

  await broadcastToGroupMembers(body.groupId, "group.event_deleted", {
    groupId: body.groupId,
    eventId: body.eventId,
    title: existing.title,
  }, userId);

  return { deleted: body.eventId };
});

// ── group.update_modules ──

interface UpdateModulesPayload {
  groupId: string;
  enabledModules: string[];
  systemRole?: string;
}

registerCommand("group", "update_modules", async (userId, payload) => {
  const body = payload as UpdateModulesPayload;
  if (!body.groupId) throw new Error("groupId is required");

  const membership = await groupMemberRepo.findByGroupAndUser(body.groupId, userId);
  const systemRole = body.systemRole || "";
  if (systemRole !== "admin" && membership?.role !== "owner" && membership?.role !== "leader") {
    throw new Error("Permission denied");
  }

  if (!Array.isArray(body.enabledModules)) {
    throw new Error("enabledModules must be an array");
  }

  const { SCHEDULA_MODULES } = await import("../../shared/constants.js");
  const validIds = new Set<string>(SCHEDULA_MODULES);
  const invalid = body.enabledModules.filter((m: string) => !validIds.has(m));
  if (invalid.length > 0) {
    throw new Error(`Invalid module IDs: ${invalid.join(", ")}`);
  }

  await groupRepo.updateEnabledModules(body.groupId, body.enabledModules);

  const user = await getUserInfo(userId);
  logActivity(userId, user.name || "Unknown", "モジュール設定変更", `グループ ${body.groupId} の使用モジュールを更新: ${body.enabledModules.join(", ")}`);

  return { enabledModules: body.enabledModules };
});
