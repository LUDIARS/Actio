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
    await ensureLocalUser(result.user.id);
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

// ─── Cernere 埋め込み認証プロキシ (モバイル半SPA 用) ─────────
// SPA に埋め込まれた <CompositeLogin> からの認証要求を project WS で Cernere に転送。
// CORS を避けるため全て same-origin。

compositeAuthRoutes.post("/cernere/login", async (c) => {
  const { compositeLogin } = await import("./cernere-client.js");
  try {
    const body = await c.req.json<{ email: string; password: string }>();
    const res = await compositeLogin(body.email, body.password);
    return c.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return c.json({ error: message }, 401);
  }
});

compositeAuthRoutes.post("/cernere/register", async (c) => {
  const { compositeRegister } = await import("./cernere-client.js");
  try {
    const body = await c.req.json<{ name: string; email: string; password: string }>();
    const res = await compositeRegister(body.name, body.email, body.password);
    return c.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return c.json({ error: message }, 400);
  }
});

compositeAuthRoutes.post("/cernere/mfa-verify", async (c) => {
  const { compositeMfaVerify } = await import("./cernere-client.js");
  try {
    const body = await c.req.json<{ mfaToken: string; method: string; code: string }>();
    const res = await compositeMfaVerify(body.mfaToken, body.method, body.code);
    return c.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "MFA verification failed";
    return c.json({ error: message }, 401);
  }
});

// ─── ユーザー自動プロビジョニング ──────────────────────────────
// Cernere 認証済みリクエストが来た際、Schedula の users テーブル
// (FK アンカー) にレコードがなければ自動作成する。
// 個人データ (name/email/role) は Cernere 側で管理するため保存しない。

async function ensureLocalUser(userId: string): Promise<void> {
  const existing = await userRepo.findById(userId);
  if (existing) return;
  await userRepo.create({ id: userId });
}

// ─── GET /me ─────────────────────────────────────────────────

auth.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "No token provided" }, 401);

  // Cernere から個人情報 (name/email/role) を取得 (cache 経由)
  const { getUserInfo } = await import("./user-info.js");
  const info = await getUserInfo(userId);

  // FK アンカー用に Schedula DB にレコード作成 (idempotent)
  await ensureLocalUser(userId);

  const user = await userRepo.findById(userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  return c.json({
    id: user.id,
    name: info.name,
    email: info.email,
    role: info.role,
    major: user.major ?? null,
    calendarAccessId: user.calendarAccessId ?? null,
  });
});

// ─── GET /users/list ─────────────────────────────────────────

auth.get("/users/list", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "No token provided" }, 401);
  const role = getUserRole(c);
  const { getUserInfos } = await import("./user-info.js");

  type LocalUser = { id: string; major: string | null; createdAt: Date };

  async function buildUsersWithGroups(
    localUsers: LocalUser[],
    filterGroupIds?: string[],
  ) {
    const infoMap = await getUserInfos(localUsers.map((u) => u.id));
    const result = [];
    for (const u of localUsers) {
      const info = infoMap.get(u.id);
      const memberships = await groupMemberRepo.findByUserId(u.id);
      const filtered = filterGroupIds
        ? memberships.filter((m: { groupId: string }) => filterGroupIds.includes(m.groupId))
        : memberships;
      const groupDetails = [];
      for (const m of filtered) {
        const group = await groupRepo.findById(m.groupId);
        if (group) groupDetails.push({ id: group.id, name: group.name, role: m.role });
      }
      result.push({
        id: u.id,
        name: info?.name ?? "",
        email: info?.email ?? "",
        role: info?.role ?? "general",
        major: u.major,
        createdAt: u.createdAt,
        groups: groupDetails,
      });
    }
    return result;
  }

  if (role === "admin") {
    const users = await userListRepo.findAllBasic();
    return c.json({ users: await buildUsersWithGroups(users) });
  }

  const myMemberships = await groupMemberRepo.findByUserId(userId);
  const myGroupIds = myMemberships.map((m: { groupId: string }) => m.groupId);

  if (myGroupIds.length === 0) {
    const me = await userListRepo.findByIds([userId]);
    return c.json({ users: await buildUsersWithGroups(me) });
  }

  const memberSets = await Promise.all(
    myGroupIds.map((gid: string) => groupMemberRepo.findByGroupId(gid)),
  );
  const userIds = [...new Set(memberSets.flat().map((m) => m.userId))];

  const users = await userListRepo.findByIds(userIds);
  return c.json({ users: await buildUsersWithGroups(users, myGroupIds) });
});

// ─── GET /users (admin のみ) ─────────────────────────────────

auth.get("/users", requireRole("admin"), async (c) => {
  const { getUserInfos } = await import("./user-info.js");
  const localUsers = await userListRepo.findAllBasic();
  const infoMap = await getUserInfos(localUsers.map((u: { id: string }) => u.id));
  const users = localUsers.map((u: { id: string; major: string | null; createdAt: Date }) => {
    const info = infoMap.get(u.id);
    return {
      id: u.id,
      name: info?.name ?? "",
      email: info?.email ?? "",
      role: info?.role ?? "general",
      major: u.major,
      createdAt: u.createdAt,
    };
  });
  return c.json({ users });
});

// ─── PUT /users/:id/role (admin のみ) ─────────────────────────
// role は Cernere 側で管理する (Schedula DB に保存しない)。
// 本エンドポイントは廃止。Cernere の admin UI でロール変更してください。

auth.put("/users/:id/role", requireRole("admin"), async (c) => {
  return c.json(
    {
      error: "Role management has moved to Cernere. Use the Cernere admin UI to change user roles.",
    },
    410,
  );
});

export { auth, compositeAuthRoutes };
