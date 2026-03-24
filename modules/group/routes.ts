import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId, getUserRole } from "../../src/middleware/getUserId.js";
import {
  groupRepo,
  groupMemberRepo,
  groupScheduleRepo,
  groupEventRepo,
  userRepo,
  userListRepo,
} from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";

const groupRoutes = new Hono();

/**
 * グループ内の権限チェック: システム管理者 or グループ owner/leader
 */
function canManageGroup(
  systemRole: string,
  memberRole: string | undefined
): boolean {
  if (systemRole === "admin") return true;
  if (memberRole === "owner" || memberRole === "leader") return true;
  return false;
}

// ─── GET /my - 自分が所属するグループ一覧 ────────────────────

groupRoutes.get("/my", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const memberships = await groupMemberRepo.findByUserId(userId);
  const groupIds = memberships.map(
    (m: { groupId: string }) => m.groupId
  );

  // バッチ取得でN+1回避
  const allGroups = await groupRepo.findByIds(groupIds);
  const groupMap = new Map(
    allGroups.map((g: { id: string }) => [g.id, g])
  );

  // 各グループのメンバー数を取得
  const allMembers =
    groupIds.length > 0
      ? await Promise.all(
          groupIds.map((gid: string) =>
            groupMemberRepo.findByGroupId(gid)
          )
        )
      : [];
  const memberCountMap = new Map(
    groupIds.map((gid: string, i: number) => [
      gid,
      allMembers[i]?.length || 0,
    ])
  );

  const groups = memberships
    .map((m: { groupId: string; role: string }) => {
      const group = groupMap.get(m.groupId) as
        | {
            id: string;
            name: string;
            description: string | null;
            createdAt: Date;
          }
        | undefined;
      if (!group) return null;
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        memberCount: memberCountMap.get(m.groupId) || 0,
        role: m.role,
        createdAt: group.createdAt,
      };
    })
    .filter(Boolean);

  return c.json({ groups });
});

// ─── GET /:id - グループ詳細 ──────────────────────────────────

groupRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  try {
    const group = await groupRepo.findById(groupId);
    if (!group) return c.json({ error: "Group not found" }, 404);

    // メンバーシップ確認
    const membership = await groupMemberRepo.findByGroupAndUser(
      groupId,
      userId
    );
    if (!membership)
      return c.json({ error: "Not a member of this group" }, 403);

    // メンバー一覧（バッチ取得でN+1回避）
    const memberRows = await groupMemberRepo.findByGroupId(groupId);
    const userIds = memberRows.map(
      (m: { userId: string }) => m.userId
    );
    const users =
      userIds.length > 0 ? await userListRepo.findByIds(userIds) : [];
    const userMap = new Map(
      users.map((u: { id: string; name: string; email: string }) => [
        u.id,
        u,
      ])
    );
    const members = memberRows.map(
      (m: { userId: string; role: string }) => ({
        userId: m.userId,
        name:
          (userMap.get(m.userId) as { name: string } | undefined)
            ?.name || "Unknown",
        email:
          (userMap.get(m.userId) as { email: string } | undefined)
            ?.email || "",
        role: m.role,
      })
    );

    // グループの予定
    const schedules = await groupScheduleRepo.findByGroupId(groupId);

    // グループの個別予定 (テーブルが存在しない場合に備えてtry-catch)
    let events: unknown[] = [];
    try {
      events = await groupEventRepo.findByGroupId(groupId);
    } catch (err) {
      console.warn(
        `[groups] グループ個別予定の取得に失敗: ${err instanceof Error ? err.message : err}`
      );
    }

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
  } catch (err) {
    console.error(
      `[groups] グループ詳細取得エラー (groupId=${groupId}):`,
      err
    );
    return c.json(
      {
        error: "グループ情報の取得に失敗しました",
        detail: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
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
  logActivity(
    userId,
    user?.name || "Unknown",
    "グループ作成",
    `グループ「${body.name}」が追加されました`
  );

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
  const existing = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
  if (existing) return c.json({ error: "Already a member" }, 409);

  await groupMemberRepo.create({
    id: uuidv4(),
    groupId,
    userId,
    role: "member",
    joinedAt: new Date(),
  });

  const user = await userRepo.findById(userId);
  logActivity(
    userId,
    user?.name || "Unknown",
    "グループ参加",
    `グループ「${group.name}」に参加しました`
  );

  return c.json({ message: "Joined group" });
});

// ─── POST /:id/leave - グループから脱退 ──────────────────────

groupRoutes.post("/:id/leave", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
  if (!membership) return c.json({ error: "Not a member" }, 404);

  await groupMemberRepo.deleteByGroupAndUser(groupId, userId);

  const group = await groupRepo.findById(groupId);
  const user = await userRepo.findById(userId);
  logActivity(
    userId,
    user?.name || "Unknown",
    "グループ脱退",
    `グループ「${group?.name || groupId}」から脱退しました`
  );

  return c.json({ message: "Left group" });
});

// ─── POST /:id/invite - グループに招待 ──────────────────────

groupRoutes.post("/:id/invite", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const systemRole = getUserRole(c);
  const groupId = c.req.param("id");

  const group = await groupRepo.findById(groupId);
  if (!group) return c.json({ error: "Group not found" }, 404);

  // 権限チェック: システム管理者 or グループ owner/leader
  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
  if (!canManageGroup(systemRole, membership?.role)) {
    return c.json(
      { error: "グループリーダーまたは管理者のみ招待できます" },
      403
    );
  }

  const body = await c.req.json<{ userId: string }>();
  if (!body.userId)
    return c.json({ error: "userId is required" }, 400);

  // 招待対象ユーザの存在確認
  const targetUser = await userRepo.findById(body.userId);
  if (!targetUser)
    return c.json({ error: "User not found" }, 404);

  // 既存メンバーかチェック
  const existing = await groupMemberRepo.findByGroupAndUser(
    groupId,
    body.userId
  );
  if (existing)
    return c.json({ error: "既にグループのメンバーです" }, 409);

  await groupMemberRepo.create({
    id: uuidv4(),
    groupId,
    userId: body.userId,
    role: "member",
    joinedAt: new Date(),
  });

  const inviter = await userRepo.findById(userId);
  logActivity(
    userId,
    inviter?.name || "Unknown",
    "グループ招待",
    `「${targetUser.name}」をグループ「${group.name}」に招待しました`
  );

  return c.json({
    message: `${targetUser.name} をグループに招待しました`,
  });
});

// ─── PUT /:id/members/:memberId/role - メンバーロール変更 ─────

groupRoutes.put("/:id/members/:memberId/role", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const systemRole = getUserRole(c);
  const groupId = c.req.param("id");
  const targetUserId = c.req.param("memberId");

  const group = await groupRepo.findById(groupId);
  if (!group) return c.json({ error: "Group not found" }, 404);

  // 権限チェック: システム管理者 or グループ owner/leader
  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
  if (!canManageGroup(systemRole, membership?.role)) {
    return c.json(
      {
        error:
          "グループリーダーまたは管理者のみロールを変更できます",
      },
      403
    );
  }

  const body = await c.req.json<{ role: string }>();
  const validRoles = ["leader", "member"];
  if (!validRoles.includes(body.role)) {
    return c.json(
      { error: `role は ${validRoles.join("/")} のいずれかを指定してください` },
      400
    );
  }

  // 対象メンバーの存在確認
  const targetMember = await groupMemberRepo.findByGroupAndUser(
    groupId,
    targetUserId
  );
  if (!targetMember)
    return c.json({ error: "対象メンバーが見つかりません" }, 404);

  // ownerのロールは変更不可
  if (targetMember.role === "owner") {
    return c.json(
      { error: "オーナーのロールは変更できません" },
      403
    );
  }

  await groupMemberRepo.updateRole(groupId, targetUserId, body.role);

  const targetUser = await userRepo.findById(targetUserId);
  const actor = await userRepo.findById(userId);
  logActivity(
    userId,
    actor?.name || "Unknown",
    "ロール変更",
    `「${targetUser?.name || targetUserId}」のロールを「${body.role}」に変更しました（グループ: ${group.name}）`
  );

  return c.json({
    message: `ロールを ${body.role} に変更しました`,
  });
});

// ─── GET /users/search - 招待用ユーザ検索 ────────────────────

groupRoutes.get("/users/search", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const allUsers = await userListRepo.findAllBasic();
  const users = allUsers.map(
    (u: { id: string; name: string; email: string }) => ({
      id: u.id,
      name: u.name,
      email: u.email,
    })
  );

  return c.json({ users });
});

// ─── POST /:id/schedules - グループ予定追加 ──────────────────

groupRoutes.post("/:id/schedules", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");

  // メンバーシップ確認
  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
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

  if (body.day < 0 || body.day > 6)
    return c.json({ error: "day must be 0-6" }, 400);
  if (body.period < 0 || body.period > 10)
    return c.json({ error: "period must be 0-10" }, 400);

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
  logActivity(
    userId,
    user?.name || "Unknown",
    "グループ予定追加",
    `グループ予定「${body.title}」が追加されました`
  );

  return c.json({ schedule: created }, 201);
});

// ─── GET /:id/events - グループの個別予定一覧 ──────────────────

groupRoutes.get("/:id/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const events = await groupEventRepo.findByGroupId(groupId);
  return c.json({ events });
});

// ─── POST /:id/events - グループの個別予定追加 ─────────────────

groupRoutes.post("/:id/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
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
  logActivity(
    userId,
    user?.name || "Unknown",
    "グループ予定追加",
    `グループ個別予定「${body.title}」が追加されました`
  );

  return c.json({ event: created }, 201);
});

// ─── PUT /:id/events/:eventId - グループの個別予定更新 ─────────

groupRoutes.put("/:id/events/:eventId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("id");
  const eventId = c.req.param("eventId");

  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
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
  if (body.description !== undefined)
    updates.description = body.description;
  if (body.date !== undefined) updates.date = body.date;
  if (body.endDate !== undefined) updates.endDate = body.endDate;
  if (body.allDay !== undefined) updates.allDay = body.allDay;
  if (body.period !== undefined) updates.period = body.period;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined)
    updates.eventType = body.eventType;

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

  const membership = await groupMemberRepo.findByGroupAndUser(
    groupId,
    userId
  );
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const existing = await groupEventRepo.findById(eventId);
  if (!existing || existing.groupId !== groupId) {
    return c.json({ error: "Event not found" }, 404);
  }

  await groupEventRepo.deleteById(eventId);
  return c.json({ deleted: eventId });
});

export { groupRoutes };
