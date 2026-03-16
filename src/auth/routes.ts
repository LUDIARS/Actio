import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, schema } from "../db/connection.js";
import { eq } from "drizzle-orm";

const auth = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || "schedula-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "1h";
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

// Google OAuth設定
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

// ─── Helper: JWTトークン生成 ────────────────────────────────

function generateTokens(userId: string, role: string) {
  const accessToken = jwt.sign({ userId, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

// ─── POST /register - パスワード認証でユーザ登録 ────────────

auth.post("/register", async (c) => {
  const body = await c.req.json<{
    name: string;
    email: string;
    password: string;
    role?: string;
    major?: string;
  }>();

  if (!body.name || !body.email || !body.password) {
    return c.json({ error: "name, email, password are required" }, 400);
  }

  if (body.password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  // Check if email already exists
  const existing = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .get();

  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(body.password, 12);
  const now = new Date();

  db.insert(schema.users)
    .values({
      id: userId,
      name: body.name,
      email: body.email,
      role: body.role || "student",
      major: body.major || null,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const { accessToken, refreshToken } = generateTokens(userId, body.role || "student");

  // Save session
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  db.insert(schema.sessions)
    .values({
      id: sessionId,
      userId,
      refreshToken,
      expiresAt,
      createdAt: now,
    })
    .run();

  return c.json({
    user: { id: userId, name: body.name, email: body.email, role: body.role || "student" },
    accessToken,
    refreshToken,
  }, 201);
});

// ─── POST /login - パスワードでログイン ─────────────────────

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .get();

  if (!user || !user.passwordHash) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const { accessToken, refreshToken } = generateTokens(user.id, user.role);

  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  db.insert(schema.sessions)
    .values({
      id: sessionId,
      userId: user.id,
      refreshToken,
      expiresAt,
      createdAt: new Date(),
    })
    .run();

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

// ─── POST /refresh - リフレッシュトークンでアクセストークン更新 ──

auth.post("/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();

  if (!body.refreshToken) {
    return c.json({ error: "refreshToken is required" }, 400);
  }

  const session = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.refreshToken, body.refreshToken))
    .get();

  if (!session) {
    return c.json({ error: "Invalid refresh token" }, 401);
  }

  if (new Date(session.expiresAt) < new Date()) {
    // Expired - delete session
    db.delete(schema.sessions)
      .where(eq(schema.sessions.id, session.id))
      .run();
    return c.json({ error: "Refresh token expired" }, 401);
  }

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .get();

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  // Rotate refresh token
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);

  db.update(schema.sessions)
    .set({ refreshToken: newRefreshToken })
    .where(eq(schema.sessions.id, session.id))
    .run();

  return c.json({ accessToken, refreshToken: newRefreshToken });
});

// ─── POST /logout - ログアウト ──────────────────────────────

auth.post("/logout", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();

  if (body.refreshToken) {
    db.delete(schema.sessions)
      .where(eq(schema.sessions.refreshToken, body.refreshToken))
      .run();
  }

  return c.json({ message: "Logged out" });
});

// ─── GET /google - Google OAuthリダイレクト ──────────────────
// Google Calendarデータ同期用の権限も同時に取得

auth.get("/google", (c) => {
  if (!GOOGLE_CLIENT_ID) {
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

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ─── GET /google/callback - Google OAuthコールバック ─────────

auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    return c.json({ error: `Google OAuth error: ${error}` }, 400);
  }

  if (!code) {
    return c.json({ error: "Authorization code not provided" }, 400);
  }

  try {
    // Exchange code for tokens
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
    };

    if (!tokenRes.ok) {
      return c.json({ error: "Failed to exchange authorization code" }, 400);
    }

    // Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userInfo = (await userInfoRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    // Check if user already exists by Google ID or email
    let user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.googleId, userInfo.id))
      .get();

    if (!user) {
      user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, userInfo.email))
        .get();
    }

    const now = new Date();
    const tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

    if (user) {
      // Update existing user with Google tokens
      db.update(schema.users)
        .set({
          googleId: userInfo.id,
          googleAccessToken: tokenData.access_token,
          googleRefreshToken: tokenData.refresh_token || user.googleRefreshToken,
          googleTokenExpiresAt: tokenExpiresAt,
          calendarAccessId: userInfo.id,
          updatedAt: now,
        })
        .where(eq(schema.users.id, user.id))
        .run();
    } else {
      // Create new user from Google profile
      const userId = uuidv4();
      db.insert(schema.users)
        .values({
          id: userId,
          name: userInfo.name,
          email: userInfo.email,
          role: "student",
          googleId: userInfo.id,
          googleAccessToken: tokenData.access_token,
          googleRefreshToken: tokenData.refresh_token || null,
          googleTokenExpiresAt: tokenExpiresAt,
          calendarAccessId: userInfo.id,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, userInfo.email))
        .get();
    }

    if (!user) {
      return c.json({ error: "Failed to create/find user" }, 500);
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    db.insert(schema.sessions)
      .values({
        id: sessionId,
        userId: user.id,
        refreshToken,
        expiresAt,
        createdAt: now,
      })
      .run();

    // In production, redirect to frontend with tokens
    // For now, return JSON
    return c.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
      calendarConnected: true,
    });
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return c.json({ error: "Internal server error during OAuth" }, 500);
  }
});

// ─── GET /me - 現在のユーザ情報取得 ─────────────────────────

auth.get("/me", (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "No token provided" }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.userId))
      .get();

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      major: user.major,
      calendarAccessId: user.calendarAccessId,
      hasGoogleAuth: !!user.googleId,
      hasPassword: !!user.passwordHash,
    });
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

export { auth };
