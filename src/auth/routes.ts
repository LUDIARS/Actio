import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { userRepo, userListRepo, groupMemberRepo, groupRepo, appSettingsRepo } from "../db/repository.js";
import * as sessionStore from "../session/store.js";
import { logActivity } from "../activity-logger.js";

const auth = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || "schedula-dev-secret-change-in-production";

// セッション設定: DB設定 > 環境変数 > デフォルト値
async function getSessionConfig() {
  let refreshDays = 30;
  let accessMinutes = 60;
  try {
    const refreshSetting = await appSettingsRepo.findByKey("session.refreshTokenDays");
    if (refreshSetting) refreshDays = Math.max(1, parseInt(refreshSetting.value, 10) || 30);
    const accessSetting = await appSettingsRepo.findByKey("session.accessTokenMinutes");
    if (accessSetting) accessMinutes = Math.max(1, parseInt(accessSetting.value, 10) || 60);
  } catch {
    // DB未初期化時はデフォルト値を使用
  }
  return { refreshDays, accessMinutes };
}

// Google OAuth設定
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:8080/api/auth/google/callback";
// フロントエンドURL（OAuthコールバック後のリダイレクト先）
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

// ─── Helper: JWTトークン生成 ────────────────────────────────

function generateTokens(userId: string, role: string, accessExpiresInSeconds: number = 3600) {
  const accessToken = jwt.sign({ userId, role }, JWT_SECRET, {
    expiresIn: accessExpiresInSeconds,
  });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

// ─── POST /register - パスワード認証でユーザ登録 ────────────

auth.post("/register", async (c) => {
  console.log("[auth:register] リクエスト受信");

  try {
    const body = await c.req.json<{
      name: string;
      email: string;
      password: string;
      role?: string;
      major?: string;
    }>();

    console.log("[auth:register] リクエストボディ:", { name: body.name, email: body.email, role: body.role });

    if (!body.name || !body.email || !body.password) {
      console.warn("[auth:register] バリデーションエラー: 必須フィールド不足");
      return c.json({ error: "name, email, password are required" }, 400);
    }

    if (body.password.length < 8) {
      console.warn("[auth:register] バリデーションエラー: パスワードが短い");
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Check if email already exists
    console.log("[auth:register] メール重複チェック:", body.email);
    const existing = await userRepo.findByEmail(body.email);

    if (existing) {
      console.warn("[auth:register] メール重複:", body.email);
      return c.json({ error: "Email already registered" }, 409);
    }

    const userId = uuidv4();
    console.log("[auth:register] パスワードハッシュ生成中...");
    const passwordHash = await bcrypt.hash(body.password, 12);
    const now = new Date();

    // 最初のユーザーは自動的に管理者(admin)になる
    const userCount = await userRepo.countAll();
    const assignedRole = userCount === 0 ? "admin" : "general";
    console.log(`[auth:register] ロール決定: ${assignedRole} (既存ユーザー数: ${userCount})`);

    console.log("[auth:register] ユーザレコード挿入中... userId:", userId);
    await userRepo.create({
      id: userId,
      name: body.name,
      email: body.email,
      role: assignedRole,
      major: body.major || null,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    console.log("[auth:register] ユーザレコード挿入完了");

    const sessionConfig = await getSessionConfig();
    const { accessToken, refreshToken } = generateTokens(userId, assignedRole, sessionConfig.accessMinutes * 60);
    console.log("[auth:register] トークン生成完了");

    // Save session (Redis優先、DBフォールバック)
    const expiresAt = new Date(Date.now() + sessionConfig.refreshDays * 24 * 60 * 60 * 1000);

    console.log("[auth:register] セッション保存中...");
    await sessionStore.createSession(userId, refreshToken, expiresAt);
    console.log("[auth:register] セッション保存完了");

    console.log("[auth:register] 登録成功 userId:", userId);
    return c.json({
      user: { id: userId, name: body.name, email: body.email, role: assignedRole },
      accessToken,
      refreshToken,
    }, 201);
  } catch (err) {
    console.error("[auth:register] エラー発生:", err);
    return c.json({ error: "Internal server error during registration" }, 500);
  }
});

// ─── POST /login - パスワードでログイン ─────────────────────

auth.post("/login", async (c) => {
  console.log("[auth:login] リクエスト受信");

  try {
    const body = await c.req.json<{ email: string; password: string }>();
    console.log("[auth:login] メール:", body.email);

    if (!body.email || !body.password) {
      console.warn("[auth:login] バリデーションエラー: 必須フィールド不足");
      return c.json({ error: "email and password are required" }, 400);
    }

    console.log("[auth:login] ユーザ検索中...");
    const user = await userRepo.findByEmail(body.email);

    if (!user || !user.passwordHash) {
      console.warn("[auth:login] ユーザが見つからない or パスワード未設定:", body.email);
      return c.json({ error: "Invalid email or password" }, 401);
    }

    console.log("[auth:login] パスワード検証中...");
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      console.warn("[auth:login] パスワード不一致:", body.email);
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const sessionConfig = await getSessionConfig();
    const { accessToken, refreshToken } = generateTokens(user.id, user.role, sessionConfig.accessMinutes * 60);

    const expiresAt = new Date(Date.now() + sessionConfig.refreshDays * 24 * 60 * 60 * 1000);

    console.log("[auth:login] セッション保存中...");
    await sessionStore.createSession(user.id, refreshToken, expiresAt);

    console.log("[auth:login] ログイン成功 userId:", user.id);
    return c.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("[auth:login] エラー発生:", err);
    return c.json({ error: "Internal server error during login" }, 500);
  }
});

// ─── POST /refresh - リフレッシュトークンでアクセストークン更新 ──

auth.post("/refresh", async (c) => {
  console.log("[auth:refresh] リクエスト受信");

  try {
    const body = await c.req.json<{ refreshToken: string }>();

    if (!body.refreshToken) {
      console.warn("[auth:refresh] refreshToken未指定");
      return c.json({ error: "refreshToken is required" }, 400);
    }

    console.log("[auth:refresh] セッション検索中...");
    const session = await sessionStore.findByRefreshToken(body.refreshToken);

    if (!session) {
      console.warn("[auth:refresh] セッションが見つからない");
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    if (session.expiresAt < new Date()) {
      console.warn("[auth:refresh] トークン期限切れ sessionId:", session.id);
      await sessionStore.deleteById(session.id);
      return c.json({ error: "Refresh token expired" }, 401);
    }

    const user = await userRepo.findById(session.userId);

    if (!user) {
      console.warn("[auth:refresh] ユーザが見つからない userId:", session.userId);
      return c.json({ error: "User not found" }, 401);
    }

    // Rotate refresh token
    const sessionConfig = await getSessionConfig();
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role, sessionConfig.accessMinutes * 60);
    const newExpiresAt = new Date(Date.now() + sessionConfig.refreshDays * 24 * 60 * 60 * 1000);

    await sessionStore.rotateRefreshToken(session.id, body.refreshToken, newRefreshToken, newExpiresAt);

    console.log("[auth:refresh] トークン更新成功 userId:", user.id);
    return c.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("[auth:refresh] エラー発生:", err);
    return c.json({ error: "Internal server error during token refresh" }, 500);
  }
});

// ─── POST /logout - ログアウト ──────────────────────────────

auth.post("/logout", async (c) => {
  console.log("[auth:logout] リクエスト受信");

  try {
    const body = await c.req.json<{ refreshToken: string }>();

    if (body.refreshToken) {
      await sessionStore.deleteByRefreshToken(body.refreshToken);
      console.log("[auth:logout] セッション削除完了");
    }

    return c.json({ message: "Logged out" });
  } catch (err) {
    console.error("[auth:logout] エラー発生:", err);
    return c.json({ error: "Internal server error during logout" }, 500);
  }
});

// ─── GET /google - Google OAuthリダイレクト ──────────────────
// Google Calendarデータ同期用の権限も同時に取得

auth.get("/google", (c) => {
  console.log("[auth:google] OAuthリダイレクト開始");
  console.log("[auth:google] GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID ? "設定済み" : "未設定");
  console.log("[auth:google] GOOGLE_REDIRECT_URI:", GOOGLE_REDIRECT_URI);
  console.log("[auth:google] FRONTEND_URL:", FRONTEND_URL);

  if (!GOOGLE_CLIENT_ID) {
    console.error("[auth:google] GOOGLE_CLIENT_IDが未設定");
    return c.json({ error: "Google OAuth is not configured" }, 500);
  }

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  console.log("[auth:google] Googleへリダイレクト");
  return c.redirect(authUrl);
});

// ─── GET /google/callback - Google OAuthコールバック ─────────

auth.get("/google/callback", async (c) => {
  console.log("[auth:google:callback] リクエスト受信");
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    console.warn("[auth:google:callback] Googleエラー:", error);
    const errorUrl = new URL(FRONTEND_URL);
    errorUrl.searchParams.set("authError", `Google OAuth error: ${error}`);
    return c.redirect(errorUrl.toString());
  }

  if (!code) {
    console.warn("[auth:google:callback] 認可コード未提供");
    const errorUrl = new URL(FRONTEND_URL);
    errorUrl.searchParams.set("authError", "Authorization code not provided");
    return c.redirect(errorUrl.toString());
  }

  try {
    // Exchange code for tokens
    console.log("[auth:google:callback] Googleトークン交換中...");
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
      scope?: string;
    };

    if (!tokenRes.ok) {
      console.error("[auth:google:callback] トークン交換失敗:", tokenData);
      const errorUrl = new URL(FRONTEND_URL);
      errorUrl.searchParams.set("authError", "Failed to exchange authorization code");
      return c.redirect(errorUrl.toString());
    }

    // Get user info from Google
    console.log("[auth:google:callback] Googleユーザ情報取得中...");
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userInfo = (await userInfoRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };
    console.log("[auth:google:callback] Googleユーザ情報:", { id: userInfo.id, email: userInfo.email, name: userInfo.name });

    // Check if user already exists by Google ID or email
    let user = await userRepo.findByGoogleId(userInfo.id);

    if (!user) {
      user = await userRepo.findByEmail(userInfo.email);
    }

    const now = new Date();
    const tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
    // Googleから付与されたスコープを記録
    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : [];
    console.log("[auth:google:callback] 付与されたスコープ:", grantedScopes);

    if (user) {
      console.log("[auth:google:callback] 既存ユーザ更新 userId:", user.id);
      await userRepo.update(user.id, {
        googleId: userInfo.id,
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token || user.googleRefreshToken,
        googleTokenExpiresAt: tokenExpiresAt,
        googleScopes: grantedScopes,
        calendarAccessId: userInfo.id,
        updatedAt: now,
      });
    } else {
      // Create new user from Google profile
      console.log("[auth:google:callback] 新規ユーザ作成");
      const userId = uuidv4();
      // 最初のユーザーは自動的に管理者(admin)になる
      const userCount = await userRepo.countAll();
      const assignedRole = userCount === 0 ? "admin" : "general";
      console.log(`[auth:google:callback] ロール決定: ${assignedRole} (既存ユーザー数: ${userCount})`);
      await userRepo.create({
        id: userId,
        name: userInfo.name,
        email: userInfo.email,
        role: assignedRole,
        googleId: userInfo.id,
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token || null,
        googleTokenExpiresAt: tokenExpiresAt,
        googleScopes: grantedScopes,
        calendarAccessId: userInfo.id,
        createdAt: now,
        updatedAt: now,
      });

      user = await userRepo.findByEmail(userInfo.email);
    }

    if (!user) {
      console.error("[auth:google:callback] ユーザ作成/検索失敗");
      const errorUrl = new URL(FRONTEND_URL);
      errorUrl.searchParams.set("authError", "Failed to create/find user");
      return c.redirect(errorUrl.toString());
    }

    // Generate JWT tokens
    const sessionConfig = await getSessionConfig();
    const { accessToken, refreshToken } = generateTokens(user.id, user.role, sessionConfig.accessMinutes * 60);

    const expiresAt = new Date(Date.now() + sessionConfig.refreshDays * 24 * 60 * 60 * 1000);
    await sessionStore.createSession(user.id, refreshToken, expiresAt);

    // フロントエンドにリダイレクト（トークンをURLパラメータで渡す）
    const redirectUrl = new URL(FRONTEND_URL);
    redirectUrl.searchParams.set("accessToken", accessToken);
    redirectUrl.searchParams.set("refreshToken", refreshToken);
    console.log("[auth:google:callback] フロントエンドにリダイレクト userId:", user.id);
    return c.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("[auth:google:callback] エラー発生:", err);
    const errorUrl = new URL(FRONTEND_URL);
    errorUrl.searchParams.set("authError", "Internal server error during OAuth");
    return c.redirect(errorUrl.toString());
  }
});

// ─── GET /me - 現在のユーザ情報取得 ─────────────────────────

auth.get("/me", async (c) => {
  console.log("[auth:me] リクエスト受信");

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[auth:me] トークン未提供");
    return c.json({ error: "No token provided" }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    console.log("[auth:me] トークン検証成功 userId:", payload.userId);

    const user = await userRepo.findById(payload.userId);

    if (!user) {
      console.warn("[auth:me] ユーザが見つからない userId:", payload.userId);
      return c.json({ error: "User not found" }, 404);
    }

    console.log("[auth:me] ユーザ情報返却 userId:", user.id);
    return c.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      major: user.major,
      calendarAccessId: user.calendarAccessId,
      hasGoogleAuth: !!user.googleId,
      hasPassword: !!user.passwordHash,
      googleScopes: user.googleScopes || [],
    });
  } catch (err) {
    console.warn("[auth:me] トークン検証失敗:", err);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

// ─── GET /users/list - ユーザー一覧取得 (全ユーザー対応) ──────
// 管理者: 全ユーザーを返す
// 一般ユーザー・グループリーダー: 同じグループに所属するユーザーのみ返す

auth.get("/users/list", async (c) => {
  console.log("[auth:users:list] リクエスト受信");

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "No token provided" }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    // Helper: ユーザーにグループ情報を付与
    async function attachGroups(users: Array<{ id: string; name: string; email: string; role: string; major: string | null; createdAt: Date }>, filterGroupIds?: string[]) {
      const result = [];
      for (const u of users) {
        const memberships = await groupMemberRepo.findByUserId(u.id);
        const filtered = filterGroupIds
          ? memberships.filter((m: { groupId: string }) => filterGroupIds.includes(m.groupId))
          : memberships;

        const groupDetails = [];
        for (const m of filtered) {
          const group = await groupRepo.findById(m.groupId);
          if (group) {
            groupDetails.push({ id: group.id, name: group.name, role: m.role });
          }
        }
        result.push({ ...u, groups: groupDetails });
      }
      return result;
    }

    if (payload.role === "admin") {
      // 管理者は全ユーザーを取得
      const users = await userListRepo.findAllBasic();
      const usersWithGroups = await attachGroups(users);
      return c.json({ users: usersWithGroups });
    }

    // 一般ユーザー・グループリーダー: 同じグループのユーザーのみ
    const myMemberships = await groupMemberRepo.findByUserId(payload.userId);
    const myGroupIds = myMemberships.map((m: { groupId: string }) => m.groupId);

    if (myGroupIds.length === 0) {
      // グループ未所属の場合は自分だけ返す
      const me = await userListRepo.findByIds([payload.userId]);
      return c.json({ users: me.map((u: Record<string, unknown>) => ({ ...u, groups: [] })) });
    }

    // 同じグループに所属するユーザーIDを取得
    const memberSets = await Promise.all(
      myGroupIds.map((gid: string) => groupMemberRepo.findByGroupId(gid))
    );
    const userIds = [...new Set(memberSets.flat().map((m) => m.userId))];

    const users = await userListRepo.findByIds(userIds);
    const usersWithGroups = await attachGroups(users, myGroupIds);

    return c.json({ users: usersWithGroups });
  } catch (err) {
    console.error("[auth:users:list] エラー:", err);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

// ─── GET /users - ユーザー一覧取得 (管理者のみ) ─────────────

auth.get("/users", async (c) => {
  console.log("[auth:users] リクエスト受信");

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "No token provided" }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    if (payload.role !== "admin") {
      return c.json({ error: "管理者権限が必要です" }, 403);
    }

    const users = await userListRepo.findAllBasic();
    return c.json({ users });
  } catch (err) {
    console.error("[auth:users] エラー:", err);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

// ─── PUT /users/:id/role - ロール変更 (管理者のみ) ──────────
// 管理者は他のユーザーを管理者またはグループリーダーに任命できる

auth.put("/users/:id/role", async (c) => {
  console.log("[auth:users:role] リクエスト受信");

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "No token provided" }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    if (payload.role !== "admin") {
      return c.json({ error: "管理者権限が必要です" }, 403);
    }

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

    const adminUser = await userRepo.findById(payload.userId);
    logActivity(payload.userId, adminUser?.name || "Unknown", "ユーザーロール変更", `ユーザー「${targetUser.name}」のロールが「${body.role}」に変更されました`);

    console.log(`[auth:users:role] ロール変更完了: ${targetUserId} → ${body.role}`);
    return c.json({
      user: { id: targetUserId, name: targetUser.name, email: targetUser.email, role: body.role },
      message: "ロールを変更しました",
    });
  } catch (err) {
    console.error("[auth:users:role] エラー:", err);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

export { auth };
