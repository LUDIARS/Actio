/**
 * ユーザープロフィール & プロジェクト別ロール API
 *
 * プロファイルデータ (displayName / bio / avatarUrl / roleTitle 等) は
 * Cernere に委譲し、Actio 自身は保存しない。
 * プロジェクト別ロール (業務上の役割) は Actio 固有なのでローカル保管。
 *
 * - GET  /api/profile/me          — 自分のプロフィール取得 (Cernere プロキシ)
 * - PUT  /api/profile/me          — 自分のプロフィール更新 (Cernere プロキシ)
 * - GET  /api/profile/users/:id   — 他ユーザーのプロフィール取得
 * - GET  /api/profile/me/roles    — 自分のプロジェクト別ロール一覧
 * - PUT  /api/profile/me/roles/:groupId — 自分のプロジェクト別ロール設定
 * - GET  /api/profile/groups/:groupId/roles — グループメンバーのロール一覧
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import { userProjectRoleRepo, groupMemberRepo } from "../../src/db/repository.js";
import type { UserProjectRoleRecord } from "../../src/db/repository.js";
import { fetchCernereProfile, updateCernereProfile } from "../../src/auth/cernere-client.js";

const profile = new Hono();

// ─── 自分のプロフィール取得 ────────────────────────────────────

profile.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  try {
    const cernereProfile = await fetchCernereProfile(userId);
    const projectRoles = await userProjectRoleRepo.findByUserId(userId);

    return c.json({
      profile: {
        userId: cernereProfile.id,
        name: cernereProfile.login,
        displayName: cernereProfile.displayName,
        email: cernereProfile.email,
        avatarUrl: cernereProfile.avatarUrl,
        role: cernereProfile.role,
        bio: cernereProfile.bio,
        roleTitle: cernereProfile.roleTitle,
        expertise: cernereProfile.expertise,
        hobbies: cernereProfile.hobbies,
      },
      projectRoles: projectRoles.map((r: UserProjectRoleRecord) => ({
        id: r.id,
        groupId: r.groupId,
        roleName: r.roleName,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch profile";
    return c.json({ error: message }, 502);
  }
});

// ─── 自分のプロフィール更新 (Cernere に委譲) ─────────────────────

profile.put("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json() as {
    displayName?: string;
    avatarUrl?: string | null;
    bio?: string;
    roleTitle?: string;
    expertise?: string[];
    hobbies?: string[];
  };

  try {
    const updated = await updateCernereProfile(userId, body);
    return c.json({
      message: "プロフィールを更新しました",
      profile: {
        userId: updated.id,
        displayName: updated.displayName,
        bio: updated.bio,
        avatarUrl: updated.avatarUrl,
        roleTitle: updated.roleTitle,
        expertise: updated.expertise,
        hobbies: updated.hobbies,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update profile";
    return c.json({ error: message }, 502);
  }
});

// ─── 他ユーザーのプロフィール取得 ──────────────────────────────
// 注: 現状は自分のトークンで Cernere 経由で取得するため、
// 他ユーザーの詳細プロファイルは Cernere 側の公開ポリシーに依存する。
// ここではプロジェクトロールのみを返す。

profile.get("/users/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const targetId = c.req.param("id");
  const projectRoles = await userProjectRoleRepo.findByUserId(targetId);

  return c.json({
    profile: { userId: targetId },
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
