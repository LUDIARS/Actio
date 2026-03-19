import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import {
  groupRepo,
  groupMemberRepo,
  groupScheduleRepo,
  groupEventRepo,
  userRepo,
} from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";

const groupRoutes = new Hono();

// ─── GET /my - 自分が所属するグループ一覧 ────────────────────

groupRoutes.get("/my", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const memberships = await groupMemberRepo.findByUserId(userId);

  const groups = [];
  for (const m of memberships) {
    const group = await groupRepo.findById(m.groupId);
    if (!group) continue;

    const members = await groupMemberRepo.findByGroupId(m.groupId);
    groups.push({
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: members.length,
      role: m.role,
      createdAt: group.createdAt,
    });
  }

  return c.json({ groups });
});

// ─── GET /:id - グループ詳細 ──────────────────────────────────

groupRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const group = await groupRepo.findById(groupId);

  if (!group) return c.json({ error: "Group not found" }, 404);

  // メンバーシップ確認
  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member of this group" }, 403);

  // メンバー一覧
  const memberRows = await groupMemberRepo.findByGroupId(groupId);
  const members = [];
  for (const m of memberRows) {
    const user = await userRepo.findById(m.userId);
    members.push({
      userId: m.userId,
      name: user?.name || "Unknown",
      email: user?.email || "",
      role: m.role,
    });
  }

  // グループの予定
  const schedules = await groupScheduleRepo.findByGroupId(groupId);

  // グループの個別予定
  const events = await groupEventRepo.findByGroupId(groupId);

  return c.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      members,
      schedules,
      events,
    },
  });
});

// ─── POST / - グループ作成 ──────────────────────────────────

groupRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name) return c.json({ error: "name is required" }, 400);

  const groupId = uuidv4();
  const now = new Date();

  await groupRepo.create({
    id: groupId,
    name: body.name,
    description: body.description || null,
    members: [userId],
    createdBy: userId,
    createdAt: now,
  });

  // 作成者をownerとして追加
  await groupMemberRepo.create({
    id: uuidv4(),
    groupId,
    userId,
    role: "owner",
    joinedAt: now,
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "グループ作成", `グループ「${body.name}」が追加されました`);

  return c.json({ groupId, message: "Group created" }, 201);
});

// ─── POST /:id/join - グループに参加 ─────────────────────────

groupRoutes.post("/:id/join", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const group = await groupRepo.findById(groupId);

  if (!group) return c.json({ error: "Group not found" }, 404);

  // 既存メンバーかチェック
  const existing = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (existing) return c.json({ error: "Already a member" }, 409);

  await groupMemberRepo.create({
    id: uuidv4(),
    groupId,
    userId,
    role: "member",
    joinedAt: new Date(),
  });

  // groups.members JSON も更新
  const currentMembers = (group.members as string[]) || [];
  await groupRepo.update(groupId, { members: [...currentMembers, userId] });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "グループ参加", `グループ「${group.name}」に参加しました`);

  return c.json({ message: "Joined group" });
});

// ─── POST /:id/leave - グループから脱退 ──────────────────────

groupRoutes.post("/:id/leave", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member" }, 404);

  await groupMemberRepo.deleteByGroupAndUser(groupId, userId);

  // groups.members JSON も更新
  const group = await groupRepo.findById(groupId);
  if (group) {
    const updatedMembers = ((group.members as string[]) || []).filter((m) => m !== userId);
    await groupRepo.update(groupId, { members: updatedMembers });
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "グループ脱退", `グループ「${group?.name || groupId}」から脱退しました`);

  return c.json({ message: "Left group" });
});

// ─── POST /:id/schedules - グループ予定追加 ──────────────────

groupRoutes.post("/:id/schedules", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  // メンバーシップ確認
  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const body = await c.req.json<{
    title: string;
    day: number;
    period: number;
    duration?: number;
    scheduleType?: string;
    date?: string;
  }>();

  if (!body.title || body.day == null || body.period == null) {
    return c.json({ error: "title, day, period are required" }, 400);
  }

  if (body.day < 0 || body.day > 6) return c.json({ error: "day must be 0-6" }, 400);
  if (body.period < 0 || body.period > 10) return c.json({ error: "period must be 0-10" }, 400);

  const id = uuidv4();

  await groupScheduleRepo.create({
    id,
    groupId,
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

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "グループ予定追加", `グループ予定「${body.title}」が追加されました`);

  return c.json({ schedule: created }, 201);
});

// ─── GET /:id/events - グループの個別予定一覧 ──────────────────

groupRoutes.get("/:id/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const events = await groupEventRepo.findByGroupId(groupId);
  return c.json({ events });
});

// ─── POST /:id/events - グループの個別予定追加 ─────────────────

groupRoutes.post("/:id/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const body = await c.req.json<{
    title: string;
    description?: string;
    date: string;
    endDate?: string;
    allDay?: boolean;
    period?: number;
    duration?: number;
    eventType?: string;
  }>();

  if (!body.title || !body.date) {
    return c.json({ error: "title and date are required" }, 400);
  }

  const id = uuidv4();
  await groupEventRepo.create({
    id,
    groupId,
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

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "グループ予定追加", `グループ個別予定「${body.title}」が追加されました`);

  return c.json({ event: created }, 201);
});

// ─── PUT /:id/events/:eventId - グループの個別予定更新 ─────────

groupRoutes.put("/:id/events/:eventId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const eventId = c.req.param("eventId");

  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const existing = await groupEventRepo.findById(eventId);
  if (!existing || existing.groupId !== groupId) {
    return c.json({ error: "Event not found" }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    description?: string;
    date?: string;
    endDate?: string;
    allDay?: boolean;
    period?: number;
    duration?: number;
    eventType?: string;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.date !== undefined) updates.date = body.date;
  if (body.endDate !== undefined) updates.endDate = body.endDate;
  if (body.allDay !== undefined) updates.allDay = body.allDay;
  if (body.period !== undefined) updates.period = body.period;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined) updates.eventType = body.eventType;

  await groupEventRepo.update(eventId, updates);
  const updated = await groupEventRepo.findById(eventId);
  return c.json({ event: updated });
});

// ─── DELETE /:id/events/:eventId - グループの個別予定削除 ──────

groupRoutes.delete("/:id/events/:eventId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const eventId = c.req.param("eventId");

  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const existing = await groupEventRepo.findById(eventId);
  if (!existing || existing.groupId !== groupId) {
    return c.json({ error: "Event not found" }, 404);
  }

  await groupEventRepo.deleteById(eventId);
  return c.json({ deleted: eventId });
});

export { groupRoutes };
