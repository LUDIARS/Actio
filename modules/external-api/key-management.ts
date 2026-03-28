/**
 * APIキー管理ルート
 *
 * ユーザがAPIクライアント (CLIENT_ID / CLIENT_SECRET) を発行・管理する。
 * 通常の JWT 認証で保護される。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getUserId } from "../../src/middleware/getUserId.js";
import { apiClientRepo } from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";
import { userRepo } from "../../src/db/repository.js";

const keyManagement = new Hono();

/** ランダムなクライアントIDを生成 (プレフィックス付き) */
function generateClientId(): string {
  return `scl_${crypto.randomBytes(16).toString("hex")}`;
}

/** ランダムなクライアントシークレットを生成 */
function generateClientSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── GET / - APIクライアント一覧 ──────────────────────────────

keyManagement.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const clients = await apiClientRepo.findByUserId(userId);

  return c.json({
    clients: clients.map((cl) => ({
      id: cl.id,
      clientId: cl.clientId,
      name: cl.name,
      scopes: cl.scopes,
      isActive: cl.isActive,
      lastUsedAt: cl.lastUsedAt,
      createdAt: cl.createdAt,
    })),
  });
});

// ─── POST / - APIクライアント作成 ─────────────────────────────

keyManagement.post("/", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    name: string;
    scopes?: string[];
  }>();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const validScopes = ["calendar", "reminders", "schedules"];
  const scopes = body.scopes || validScopes;
  for (const s of scopes) {
    if (!validScopes.includes(s)) {
      return c.json({ error: `Invalid scope: ${s}. Valid scopes: ${validScopes.join(", ")}` }, 400);
    }
  }

  const id = uuidv4();
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const clientSecretHash = await bcrypt.hash(clientSecret, 10);
  const now = new Date();

  await apiClientRepo.create({
    id,
    userId,
    clientId,
    clientSecretHash,
    name: body.name,
    scopes,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "APIクライアント作成", `APIクライアント「${body.name}」が作成されました`);

  // シークレットは作成時のみ返す (以後は取得不可)
  return c.json({
    client: {
      id,
      clientId,
      clientSecret,
      name: body.name,
      scopes,
      isActive: true,
      createdAt: now,
    },
    warning: "clientSecret は今回のレスポンスでのみ表示されます。安全に保管してください。",
  }, 201);
});

// ─── POST /:id/regenerate - クライアントID再発行 ──────────────

keyManagement.post("/:id/regenerate", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const client = await apiClientRepo.findByIdAndUserId(id, userId);

  if (!client) return c.json({ error: "API client not found" }, 404);

  const newClientId = generateClientId();
  const newClientSecret = generateClientSecret();
  const newSecretHash = await bcrypt.hash(newClientSecret, 10);

  await apiClientRepo.update(id, {
    clientId: newClientId,
    clientSecretHash: newSecretHash,
    updatedAt: new Date(),
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "APIキー再発行", `APIクライアント「${client.name}」のキーが再発行されました`);

  return c.json({
    client: {
      id,
      clientId: newClientId,
      clientSecret: newClientSecret,
      name: client.name,
      scopes: client.scopes,
      isActive: client.isActive,
    },
    warning: "clientSecret は今回のレスポンスでのみ表示されます。安全に保管してください。",
  });
});

// ─── PUT /:id - APIクライアント更新 (名前・スコープ・有効/無効) ─

keyManagement.put("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const client = await apiClientRepo.findByIdAndUserId(id, userId);

  if (!client) return c.json({ error: "API client not found" }, 404);

  const body = await c.req.json<{
    name?: string;
    scopes?: string[];
    isActive?: boolean;
  }>();

  const validScopes = ["calendar", "reminders", "schedules"];
  if (body.scopes) {
    for (const s of body.scopes) {
      if (!validScopes.includes(s)) {
        return c.json({ error: `Invalid scope: ${s}` }, 400);
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.scopes !== undefined) updates.scopes = body.scopes;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  await apiClientRepo.update(id, updates);

  const updated = await apiClientRepo.findById(id);

  return c.json({
    client: updated ? {
      id: updated.id,
      clientId: updated.clientId,
      name: updated.name,
      scopes: updated.scopes,
      isActive: updated.isActive,
      lastUsedAt: updated.lastUsedAt,
      createdAt: updated.createdAt,
    } : null,
  });
});

// ─── DELETE /:id - APIクライアント削除 ────────────────────────

keyManagement.delete("/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const id = c.req.param("id");
  const client = await apiClientRepo.findByIdAndUserId(id, userId);

  if (!client) return c.json({ error: "API client not found" }, 404);

  await apiClientRepo.deleteById(id);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "APIクライアント削除", `APIクライアント「${client.name}」が削除されました`);

  return c.json({ message: "API client deleted" });
});

export { keyManagement };
