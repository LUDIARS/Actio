import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../../src/middleware/auth.js";
import { getUserId } from "../../src/middleware/getUserId.js";

const groupRoutes = new Hono();

// ─── GET /my - 自分が所属するグループ一覧 ────────────────────

groupRoutes.get("/my", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const memberships = db
    .select()
    .from(schema.groupMembers)
    .where(eq(schema.groupMembers.userId, userId))
    .all();

  const groups = memberships.map((m) => {
    const group = db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, m.groupId))
      .get();

    if (!group) return null;

    const memberCount = db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.groupId, m.groupId))
      .all().length;

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount,
      role: m.role,
      createdAt: group.createdAt,
    };
  }).filter(Boolean);

  return c.json({ groups });
});

// ─── GET /:id - グループ詳細 ──────────────────────────────────

groupRoutes.get("/:id", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const group = db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .get();

  if (!group) return c.json({ error: "Group not found" }, 404);

  // メンバーシップ確認
  const membership = db
    .select()
    .from(schema.groupMembers)
    .where(
      and(
        eq(schema.groupMembers.groupId, groupId),
        eq(schema.groupMembers.userId, userId)
      )
    )
    .get();

  if (!membership) return c.json({ error: "Not a member of this group" }, 403);

  // メンバー一覧
  const members = db
    .select()
    .from(schema.groupMembers)
    .where(eq(schema.groupMembers.groupId, groupId))
    .all()
    .map((m) => {
      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, m.userId))
        .get();
      return {
        userId: m.userId,
        name: user?.name || "Unknown",
        email: user?.email || "",
        role: m.role,
      };
    });

  // グループの予定
  const schedules = db
    .select()
    .from(schema.groupSchedules)
    .where(eq(schema.groupSchedules.groupId, groupId))
    .all();

  return c.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      members,
      schedules,
    },
  });
});

// ─── POST / - グループ作成 (管理者のみ) ──────────────────────

groupRoutes.post("/", requireRole("admin"), async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name) return c.json({ error: "name is required" }, 400);

  const groupId = uuidv4();
  const now = new Date();

  db.insert(schema.groups)
    .values({
      id: groupId,
      name: body.name,
      description: body.description || null,
      members: [userId],
      createdBy: userId,
      createdAt: now,
    })
    .run();

  // 作成者をownerとして追加
  db.insert(schema.groupMembers)
    .values({
      id: uuidv4(),
      groupId,
      userId,
      role: "owner",
      joinedAt: now,
    })
    .run();

  return c.json({ groupId, message: "Group created" }, 201);
});

// ─── POST /:id/join - グループに参加 ─────────────────────────

groupRoutes.post("/:id/join", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const group = db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .get();

  if (!group) return c.json({ error: "Group not found" }, 404);

  // 既存メンバーかチェック
  const existing = db
    .select()
    .from(schema.groupMembers)
    .where(
      and(
        eq(schema.groupMembers.groupId, groupId),
        eq(schema.groupMembers.userId, userId)
      )
    )
    .get();

  if (existing) return c.json({ error: "Already a member" }, 409);

  db.insert(schema.groupMembers)
    .values({
      id: uuidv4(),
      groupId,
      userId,
      role: "member",
      joinedAt: new Date(),
    })
    .run();

  // groups.members JSON も更新
  const currentMembers = (group.members as string[]) || [];
  db.update(schema.groups)
    .set({ members: [...currentMembers, userId] })
    .where(eq(schema.groups.id, groupId))
    .run();

  return c.json({ message: "Joined group" });
});

// ─── POST /:id/leave - グループから脱退 ──────────────────────

groupRoutes.post("/:id/leave", (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  const membership = db
    .select()
    .from(schema.groupMembers)
    .where(
      and(
        eq(schema.groupMembers.groupId, groupId),
        eq(schema.groupMembers.userId, userId)
      )
    )
    .get();

  if (!membership) return c.json({ error: "Not a member" }, 404);

  db.delete(schema.groupMembers)
    .where(
      and(
        eq(schema.groupMembers.groupId, groupId),
        eq(schema.groupMembers.userId, userId)
      )
    )
    .run();

  // groups.members JSON も更新
  const group = db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .get();

  if (group) {
    const updatedMembers = ((group.members as string[]) || []).filter((m) => m !== userId);
    db.update(schema.groups)
      .set({ members: updatedMembers })
      .where(eq(schema.groups.id, groupId))
      .run();
  }

  return c.json({ message: "Left group" });
});

// ─── POST /:id/schedules - グループ予定追加 ──────────────────
// グループの予定は削除不可

groupRoutes.post("/:id/schedules", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  // メンバーシップ確認
  const membership = db
    .select()
    .from(schema.groupMembers)
    .where(
      and(
        eq(schema.groupMembers.groupId, groupId),
        eq(schema.groupMembers.userId, userId)
      )
    )
    .get();

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

  db.insert(schema.groupSchedules)
    .values({
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
    })
    .run();

  const created = db
    .select()
    .from(schema.groupSchedules)
    .where(eq(schema.groupSchedules.id, id))
    .get();

  return c.json({ schedule: created }, 201);
});

export { groupRoutes };
