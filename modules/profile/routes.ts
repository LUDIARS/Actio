/**
 * ユーザープロフィール & プロジェクト別ロール API
 *
 * - GET  /api/profile/me          — 自分のプロフィール取得
 * - PUT  /api/profile/me          — 自分のプロフィール更新
 * - GET  /api/profile/users/:id   — 他ユーザーのプロフィール取得
 * - GET  /api/profile/me/roles    — 自分のプロジェクト別ロール一覧
 * - PUT  /api/profile/me/roles/:groupId — 自分のプロジェクト別ロール設定
 * - GET  /api/profile/groups/:groupId/roles — グループメンバーのロール一覧
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { userProfileRepo, userProjectRoleRepo, userRepo, groupMemberRepo } from "../../src/db/repository.js";
import type { UserProjectRoleRecord } from "../../src/db/repository.js";

const profile = new Hono();

// ─── 自分のプロフィール取得 ────────────────────────────────────

profile.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const user = await userRepo.findById(userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const profileData = await userProfileRepo.findByUserId(userId);
  const projectRoles = await userProjectRoleRepo.findByUserId(userId);

  return c.json({
    profile: {
      userId: user.id,
      name: user.name,
      email: user.email,
      displayName: profileData?.displayName ?? null,
      bio: profileData?.bio ?? "",
      avatarUrl: profileData?.avatarUrl ?? null,
    },
    projectRoles: projectRoles.map((r: UserProjectRoleRecord) => ({
      id: r.id,
      groupId: r.groupId,
      roleName: r.roleName,
    })),
  });
});

// ─── 自分のプロフィール更新 ────────────────────────────────────

profile.put("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json() as {
    bio?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };

  await userProfileRepo.upsert({
    id: uuidv4(),
    userId,
    bio: body.bio ?? "",
    displayName: body.displayName ?? null,
    avatarUrl: body.avatarUrl ?? null,
  });

  const updated = await userProfileRepo.findByUserId(userId);
  return c.json({
    message: "プロフィールを更新しました",
    profile: {
      userId,
      displayName: updated?.displayName ?? null,
      bio: updated?.bio ?? "",
      avatarUrl: updated?.avatarUrl ?? null,
    },
  });
});

// ─── 他ユーザーのプロフィール取得 ──────────────────────────────

profile.get("/users/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const targetId = c.req.param("id");
  const user = await userRepo.findById(targetId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const profileData = await userProfileRepo.findByUserId(targetId);
  const projectRoles = await userProjectRoleRepo.findByUserId(targetId);

  return c.json({
    profile: {
      userId: user.id,
      name: user.name,
      email: user.email,
      displayName: profileData?.displayName ?? null,
      bio: profileData?.bio ?? "",
      avatarUrl: profileData?.avatarUrl ?? null,
    },
    projectRoles: projectRoles.map((r: UserProjectRoleRecord) => ({
      id: r.id,
      groupId: r.groupId,
      roleName: r.roleName,
    })),
  });
});

// ─── 自分のプロジェクト別ロール一覧 ────────────────────────────

profile.get("/me/roles", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const roles = await userProjectRoleRepo.findByUserId(userId);
  return c.json({
    roles: roles.map((r: UserProjectRoleRecord) => ({
      id: r.id,
      groupId: r.groupId,
      roleName: r.roleName,
    })),
  });
});

// ─── 自分のプロジェクト別ロール設定 ────────────────────────────

profile.put("/me/roles/:groupId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const groupId = c.req.param("groupId");

  // グループメンバーか確認
  const membership = await groupMemberRepo.findByGroupAndUser(groupId, userId);
  if (!membership) {
    return c.json({ error: "このグループのメンバーではありません" }, 403);
  }

  const body = await c.req.json() as { roles: string[] };
  const roleNames = body.roles ?? [];

  // 既存ロールを削除して再作成
  await userProjectRoleRepo.deleteByUserAndGroup(userId, groupId);

  for (const roleName of roleNames) {
    if (roleName.trim()) {
      await userProjectRoleRepo.create({
        id: uuidv4(),
        userId,
        groupId,
        roleName: roleName.trim(),
      });
    }
  }

  const updated = await userProjectRoleRepo.findByUserAndGroup(userId, groupId);
  return c.json({
    message: "プロジェクトロールを更新しました",
    roles: updated.map((r: UserProjectRoleRecord) => ({
      id: r.id,
      groupId: r.groupId,
      roleName: r.roleName,
    })),
  });
});

// ─── グループメンバーのロール一覧 ──────────────────────────────

profile.get("/groups/:groupId/roles", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const groupId = c.req.param("groupId");
  const roles = await userProjectRoleRepo.findByGroupId(groupId);

  return c.json({
    roles: roles.map((r: UserProjectRoleRecord) => ({
      id: r.id,
      userId: r.userId,
      groupId: r.groupId,
      roleName: r.roleName,
    })),
  });
});

export { profile as profileRoutes };
