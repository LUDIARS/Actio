/**
 * Id Service — 認証ルート (スタンドアロンサービス版)
 *
 * KVS ベースのユーザー管理 + YAML スキーマ準拠の
 * プロフィール拡張を提供する。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { UserKvsRepo, SessionKvsRepo, ProfileKvsRepo } from "./kvs.js";
import type { ServiceSchema } from "./schema-parser.js";

export interface IdServiceRouteConfig {
  jwtSecret: string;
  userRepo: UserKvsRepo;
  sessionRepo: SessionKvsRepo;
  profileRepo: ProfileKvsRepo;
  serviceSchemas: ServiceSchema[];

  /** セッション設定 */
  refreshDays?: number;
  accessMinutes?: number;

  /** Google OAuth */
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  frontendUrl?: string;
}

function generateTokens(jwtSecret: string, userId: string, role: string, expiresInSec: number) {
  const accessToken = jwt.sign({ userId, role }, jwtSecret, { expiresIn: expiresInSec });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

export function createIdServiceRoutes(config: IdServiceRouteConfig) {
  const {
    jwtSecret,
    userRepo,
    sessionRepo,
    profileRepo,
    serviceSchemas,
    refreshDays = 30,
    accessMinutes = 60,
    googleClientId = "",
    googleClientSecret = "",
    googleRedirectUri = "http://localhost:8079/api/auth/google/callback",
    frontendUrl = "http://localhost:8080",
  } = config;

  const app = new Hono();

  // ─── POST /register ──────────────────────────────────

  app.post("/register", async (c) => {
    try {
      const body = await c.req.json<{
        name: string; email: string; password: string;
        profiles?: Record<string, Record<string, unknown>>;
      }>();

      if (!body.name || !body.email || !body.password) {
        return c.json({ error: "name, email, password are required" }, 400);
      }
      if (body.password.length < 8) {
        return c.json({ error: "Password must be at least 8 characters" }, 400);
      }

      const existing = await userRepo.findByEmail(body.email);
      if (existing) return c.json({ error: "Email already registered" }, 409);

      const userId = uuidv4();
      const passwordHash = await bcrypt.hash(body.password, 12);
      const now = new Date().toISOString();
      const count = await userRepo.countAll();
      const role = count === 0 ? "admin" : "general";

      await userRepo.create({
        id: userId, name: body.name, email: body.email, role,
        passwordHash, createdAt: now, updatedAt: now,
      });

      // サービスプロフィール保存
      if (body.profiles) {
        for (const [serviceId, data] of Object.entries(body.profiles)) {
          await profileRepo.set(serviceId, userId, data);
        }
      }

      const { accessToken, refreshToken } = generateTokens(jwtSecret, userId, role, accessMinutes * 60);
      const expiresAt = new Date(Date.now() + refreshDays * 86400000).toISOString();
      await sessionRepo.create({ id: uuidv4(), userId, refreshToken, expiresAt, createdAt: now });

      return c.json({ user: { id: userId, name: body.name, email: body.email, role }, accessToken, refreshToken }, 201);
    } catch (err) {
      console.error("[id-service:register]", err);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // ─── POST /login ─────────────────────────────────────

  app.post("/login", async (c) => {
    try {
      const body = await c.req.json<{ email: string; password: string }>();
      if (!body.email || !body.password) {
        return c.json({ error: "email and password are required" }, 400);
      }

      const user = await userRepo.findByEmail(body.email);
      if (!user || !user.passwordHash) {
        return c.json({ error: "Invalid email or password" }, 401);
      }

      const valid = await bcrypt.compare(body.password, user.passwordHash as string);
      if (!valid) return c.json({ error: "Invalid email or password" }, 401);

      const role = (user.role as string) || "general";
      const { accessToken, refreshToken } = generateTokens(jwtSecret, user.id, role, accessMinutes * 60);
      const expiresAt = new Date(Date.now() + refreshDays * 86400000).toISOString();
      await sessionRepo.create({ id: uuidv4(), userId: user.id, refreshToken, expiresAt, createdAt: new Date().toISOString() });

      await userRepo.update(user.id, { lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

      return c.json({ user: { id: user.id, name: user.name, email: user.email, role }, accessToken, refreshToken });
    } catch (err) {
      console.error("[id-service:login]", err);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // ─── POST /refresh ───────────────────────────────────

  app.post("/refresh", async (c) => {
    try {
      const body = await c.req.json<{ refreshToken: string }>();
      if (!body.refreshToken) return c.json({ error: "refreshToken is required" }, 400);

      const session = await sessionRepo.findByRefreshToken(body.refreshToken);
      if (!session) return c.json({ error: "Invalid refresh token" }, 401);

      if (new Date(session.expiresAt) < new Date()) {
        await sessionRepo.deleteById(session.id);
        return c.json({ error: "Refresh token expired" }, 401);
      }

      const user = await userRepo.findById(session.userId);
      if (!user) return c.json({ error: "User not found" }, 401);

      const role = (user.role as string) || "general";
      const { accessToken, refreshToken: newToken } = generateTokens(jwtSecret, user.id, role, accessMinutes * 60);
      const newExpires = new Date(Date.now() + refreshDays * 86400000).toISOString();
      await sessionRepo.rotateRefreshToken(session.id, body.refreshToken, newToken, newExpires);

      return c.json({ accessToken, refreshToken: newToken });
    } catch (err) {
      console.error("[id-service:refresh]", err);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // ─── POST /logout ────────────────────────────────────

  app.post("/logout", async (c) => {
    try {
      const body = await c.req.json<{ refreshToken: string }>();
      if (body.refreshToken) await sessionRepo.deleteByRefreshToken(body.refreshToken);
      return c.json({ message: "Logged out" });
    } catch (err) {
      console.error("[id-service:logout]", err);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // ─── GET /me ─────────────────────────────────────────

  app.get("/me", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "No token" }, 401);

    try {
      const payload = jwt.verify(authHeader.slice(7), jwtSecret) as { userId: string; role: string };
      const user = await userRepo.findById(payload.userId);
      if (!user) return c.json({ error: "User not found" }, 404);

      const response: Record<string, unknown> = {
        id: user.id, name: user.name, email: user.email,
        role: user.role,
        hasGoogleAuth: !!user.googleId,
        hasPassword: !!user.passwordHash,
        googleScopes: user.googleScopes || [],
      };

      // サービスプロフィールをマージ
      const allProfiles = await profileRepo.getAllForUser(user.id);
      response.profiles = allProfiles;

      // フラット化 (後方互換)
      for (const profileData of Object.values(allProfiles)) {
        Object.assign(response, profileData);
      }

      return c.json(response);
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });

  // ─── GET /users ──────────────────────────────────────

  app.get("/users", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "No token" }, 401);

    try {
      const payload = jwt.verify(authHeader.slice(7), jwtSecret) as { userId: string; role: string };
      if (payload.role !== "admin") return c.json({ error: "管理者権限が必要です" }, 403);

      const users = await userRepo.findAll();
      const publicUsers = users.map((u) => ({
        id: u.id, name: u.name, email: u.email,
        role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
      }));
      return c.json({ users: publicUsers });
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });

  // ─── PUT /users/:id/role ─────────────────────────────

  app.put("/users/:id/role", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "No token" }, 401);

    try {
      const payload = jwt.verify(authHeader.slice(7), jwtSecret) as { userId: string; role: string };
      if (payload.role !== "admin") return c.json({ error: "管理者権限が必要です" }, 403);

      const targetId = c.req.param("id");
      const body = await c.req.json<{ role: string }>();
      if (!["admin", "group_leader", "general"].includes(body.role)) {
        return c.json({ error: "無効なロール" }, 400);
      }

      const target = await userRepo.findById(targetId);
      if (!target) return c.json({ error: "ユーザーが見つかりません" }, 404);

      await userRepo.update(targetId, { role: body.role, updatedAt: new Date().toISOString() });
      return c.json({ user: { id: targetId, name: target.name, email: target.email, role: body.role }, message: "ロールを変更しました" });
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });

  // ─── PUT /password ───────────────────────────────────

  app.put("/password", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "No token" }, 401);

    try {
      const payload = jwt.verify(authHeader.slice(7), jwtSecret) as { userId: string };
      const body = await c.req.json<{ currentPassword?: string; newPassword: string }>();

      if (!body.newPassword || body.newPassword.length < 8) {
        return c.json({ error: "新しいパスワードは8文字以上" }, 400);
      }

      const user = await userRepo.findById(payload.userId);
      if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);

      if (user.passwordHash) {
        if (!body.currentPassword) return c.json({ error: "現在のパスワードを入力してください" }, 400);
        const valid = await bcrypt.compare(body.currentPassword, user.passwordHash as string);
        if (!valid) return c.json({ error: "現在のパスワードが正しくありません" }, 401);
      }

      const newHash = await bcrypt.hash(body.newPassword, 12);
      await userRepo.update(payload.userId, { passwordHash: newHash, updatedAt: new Date().toISOString() });
      return c.json({ message: "パスワードを変更しました" });
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });

  // ─── Profile API ─────────────────────────────────────

  app.get("/profiles/:serviceId/:userId", async (c) => {
    const { serviceId, userId } = c.req.param();
    const data = await profileRepo.get(serviceId, userId);
    return c.json({ profile: data ?? {} });
  });

  app.put("/profiles/:serviceId/:userId", async (c) => {
    const { serviceId, userId } = c.req.param();
    const body = await c.req.json<Record<string, unknown>>();
    await profileRepo.set(serviceId, userId, body);
    return c.json({ message: "Profile updated" });
  });

  // ─── GET /schema — 登録済みスキーマ一覧 ──────────────

  app.get("/schema", (c) => {
    return c.json({
      services: serviceSchemas.map((s) => ({
        id: s.service.id,
        name: s.service.name,
        description: s.service.description,
        fields: Object.entries(s.fields).map(([name, def]) => ({
          name, type: def.type, required: def.required ?? false, description: def.description,
        })),
      })),
    });
  });

  // ─── JWT Verify (他サービスからの検証用) ──────────────

  app.post("/verify", async (c) => {
    const body = await c.req.json<{ token: string }>();
    try {
      const payload = jwt.verify(body.token, jwtSecret) as { userId: string; role: string };
      const user = await userRepo.findById(payload.userId);
      if (!user) return c.json({ valid: false, error: "User not found" }, 404);
      return c.json({
        valid: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch {
      return c.json({ valid: false, error: "Invalid token" }, 401);
    }
  });

  // ─── Health ──────────────────────────────────────────

  app.get("/health", (c) => {
    return c.json({ status: "ok", service: "id-service", timestamp: new Date().toISOString() });
  });

  return app;
}
