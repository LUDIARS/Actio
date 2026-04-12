/**
 * 認証ルート — Schedula 固有エンドポイントのみ
 *
 * 認証処理 (login, register, refresh, logout, OAuth) は Cernere に委譲。
 * ここでは Schedula 固有のユーザー情報 API のみを提供する。
 *
 *   GET  /me          — 現在のユーザー情報 (Schedula 固有フィールド付き)
 *   GET  /users/list  — ユーザー一覧 (グループベース)
 *   GET  /users       — 全ユーザー一覧 (admin のみ)
 *   PUT  /users/:id/role — ロール変更 (admin のみ)
 */

import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { getUserId, getUserRole } from "../middleware/getUserId.js";
import { requireRole } from "../middleware/auth.js";
import { secretManager } from "../config/secrets.js";
import {
  userRepo,
  userListRepo,
  groupMemberRepo,
  groupRepo,
} from "../db/repository.js";
import { logActivity } from "../activity-logger.js";
import { isCompositeEnabled, getLoginUrl, exchangeAuthCode } from "./composite.js";
import { saveSessionUser, invalidateSessionUser } from "./session-cache.js";

const TOKEN_COOKIE = "schedula_token";
const TOKEN_COOKIE_MAX_AGE = 3600; // 1時間 (トークン有効期限に合わせる)

function setTokenCookie(c: Parameters<typeof setCookie>[0], token: string) {
  const isProd = secretManager.getOrDefault("NODE_ENV", "") === "production";
  setCookie(c, TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: TOKEN_COOKIE_MAX_AGE,
  });
}

interface IdUserBasic {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date | null;
  lastLoginAt: Date | null;
}

const auth = new Hono();

// ─── 認証不要ルート (userContext の前にマウントされる) ──────────
const compositeAuthRoutes = new Hono();

compositeAuthRoutes.get("/login-url", (c) => {
  if (!isCompositeEnabled()) {
    return c.json({ error: "Cernere Composite is not configured" }, 503);
  }
  const origin = c.req.query("origin");
  if (!origin) {
    return c.json({ error: "origin query parameter is required" }, 400);
  }
  const url = getLoginUrl(origin);
  return c.json({ url });
});

compositeAuthRoutes.post("/exchange", async (c) => {
  if (!isCompositeEnabled()) {
    return c.json({ error: "Cernere Composite is not configured" }, 503);
  }
  const body = await c.req.json<{ authCode: string }>();
  if (!body.authCode) {
    return c.json({ error: "authCode is required" }, 400);
  }
  try {
    const result = await exchangeAuthCode(body.authCode);
    await ensureLocalUser(result.user.id, result.user.role);
    // Redis にセッションユーザー情報をキャッシュ
    await saveSessionUser({
      id: result.user.id,
      name: result.user.displayName ?? "",
      email: result.user.email ?? "",
      role: result.user.role,
    });
    // HttpOnly Cookie にトークンを保存 (XSS対策)
    setTokenCookie(c, result.serviceToken);
    return c.json({ user: result.user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Exchange failed";
    return c.json({ error: message }, 401);
  }
});

// ログアウト: Cookie を削除 + Redis セッション無効化
compositeAuthRoutes.post("/logout", async (c) => {
  const { getCookie } = await import("hono/cookie");
  const token = getCookie(c, TOKEN_COOKIE);
  if (token) {
    try {
      const jwt = await import("jsonwebtoken");
      const payload = jwt.default.decode(token) as { sub?: string } | null;
      if (payload?.sub) {
        await invalidateSessionUser(payload.sub);
      }
    } catch { /* 無視 */ }
  }
  deleteCookie(c, TOKEN_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// WS接続用の短期トークン発行 (Cookie → URL パラメータ用トークン)
// WebSocket でクエリパラメータにトークンが必要な環境で使用
compositeAuthRoutes.get("/ws-token", async (c) => {
  const { getCookie } = await import("hono/cookie");
  const token = getCookie(c, TOKEN_COOKIE);
  if (!token) return c.json({ error: "Not authenticated" }, 401);
  return c.json({ token });
});

// ─── ユーザー自動プロビジョニング ──────────────────────────────
// Cernere 認証済みリクエストが来た際、Schedula の users テーブルに
// レコードがなければ自動作成する。

async function ensureLocalUser(userId: string, role: string): Promise<void> {
  const existing = await userRepo.findById(userId);
  if (existing) return;

  await userRepo.create({
    id: userId,
    name: "",
    email: "",
    role: role === "admin" ? "admin" : "general",
  });
}

// ─── GET /me ─────────────────────────────────────────────────

auth.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "No token provided" }, 401);

  await ensureLocalUser(userId, getUserRole(c));

  const user = await userRepo.findById(userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const userRecord = user as unknown as Record<string, unknown>;

  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    major: userRecord.major ?? null,
    calendarAccessId: userRecord.calendarAccessId ?? null,
  });
});

// ─── GET /users/list ─────────────────────────────────────────

auth.get("/users/list", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "No token provided" }, 401);
  const role = getUserRole(c);

  async function attachGroups(users: IdUserBasic[], filterGroupIds?: string[]) {
    const result = [];
    for (const u of users) {
      const memberships = await groupMemberRepo.findByUserId(u.id);
      const filtered = filterGroupIds
        ? memberships.filter((m: { groupId: string }) => filterGroupIds.includes(m.groupId))
        : memberships;

      const groupDetails = [];
      for (const m of filtered) {
        const group = await groupRepo.findById(m.groupId);
        if (group) groupDetails.push({ id: group.id, name: group.name, role: m.role });
      }
      result.push({ ...u, groups: groupDetails });
    }
    return result;
  }

  if (role === "admin") {
    const users = await userListRepo.findAllBasic();
    const usersWithGroups = await attachGroups(users);
    return c.json({ users: usersWithGroups });
  }

  const myMemberships = await groupMemberRepo.findByUserId(userId);
  const myGroupIds = myMemberships.map((m: { groupId: string }) => m.groupId);

  if (myGroupIds.length === 0) {
    const me = await userListRepo.findByIds([userId]);
    return c.json({
      users: me.map((u: IdUserBasic) => ({
        ...u, groups: [] as Array<{ id: string; name: string; role: string }>,
      })),
    });
  }

  const memberSets = await Promise.all(
    myGroupIds.map((gid: string) => groupMemberRepo.findByGroupId(gid)),
  );
  const userIds = [...new Set(memberSets.flat().map((m) => m.userId))];

  const users = await userListRepo.findByIds(userIds);
  const usersWithGroups = await attachGroups(users, myGroupIds);

  return c.json({ users: usersWithGroups });
});

// ─── GET /users (admin のみ) ─────────────────────────────────

auth.get("/users", requireRole("admin"), async (c) => {
  const users = await userListRepo.findAllBasic();
  return c.json({ users });
});

// ─── PUT /users/:id/role (admin のみ) ─────────────────────────

auth.put("/users/:id/role", requireRole("admin"), async (c) => {
  const adminUserId = getUserId(c);
  const targetUserId = c.req.param("id");
  const body = await c.req.json<{ role: string }>();

  if (!["admin", "group_leader", "general"].includes(body.role)) {
    return c.json({ error: "無効なロールです。admin, group_leader, general のいずれかを指定してください" }, 400);
  }

  const targetUser = await userRepo.findById(targetUserId);
  if (!targetUser) {
    return c.json({ error: "ユーザーが見つかりません" }, 404);
  }

  await userRepo.update(targetUserId, { role: body.role, updatedAt: new Date() });

  if (adminUserId) {
    const adminUser = await userRepo.findById(adminUserId);
    logActivity(adminUserId, adminUser?.name || "Unknown", "ユーザーロール変更", `ユーザー「${targetUser.name}」のロールが「${body.role}」に変更されました`);
  }

  return c.json({
    user: { id: targetUserId, name: targetUser.name, email: targetUser.email, role: body.role },
    message: "ロールを変更しました",
  });
});

export { auth, compositeAuthRoutes };
