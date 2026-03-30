/**
 * Id Service — スタンドアロンサーバー
 *
 * 独立した認証サービスとして起動する。
 * KVS (Redis or InMemory) でユーザーデータを管理。
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import Redis from "ioredis";
import path from "path";
import { loadSchemas } from "./schema-parser.js";
import {
  createRedisKvs,
  createMemoryKvs,
  UserKvsRepo,
  SessionKvsRepo,
  ProfileKvsRepo,
} from "./kvs.js";
import { createIdServiceRoutes } from "./routes.js";

const PORT = parseInt(process.env.ID_SERVICE_PORT || "8079", 10);
const REDIS_URL = process.env.REDIS_URL || "";
const JWT_SECRET = process.env.JWT_SECRET || "id-service-dev-secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";
const SCHEMA_DIR = process.env.ID_SCHEMA_DIR || path.resolve(import.meta.dirname, "../schema");

// ─── KVS 初期化 ──────────────────────────────────────────

let kvs;
if (REDIS_URL) {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
  redis.on("connect", () => console.log("[id-service] Redis 接続成功"));
  redis.on("error", (err) => console.error("[id-service] Redis エラー:", err.message));
  kvs = createRedisKvs(redis);
  console.log("[id-service] KVS: Redis");
} else {
  kvs = createMemoryKvs();
  console.log("[id-service] KVS: InMemory (REDIS_URL 未設定)");
}

// ─── スキーマ読み込み ────────────────────────────────────

const schemas = loadSchemas(SCHEMA_DIR);
console.log(`[id-service] コアスキーマ: ${Object.keys(schemas.core.fields).length} フィールド`);
console.log(`[id-service] サービススキーマ: ${schemas.services.length} 件`);
for (const s of schemas.services) {
  console.log(`  - ${s.service.id} (${s.service.name}): ${Object.keys(s.fields).length} フィールド`);
}

// ─── リポジトリ初期化 ────────────────────────────────────

const userRepo = new UserKvsRepo(kvs);
const sessionRepo = new SessionKvsRepo(kvs);
const profileRepo = new ProfileKvsRepo(kvs);

// ─── アプリ組み立て ──────────────────────────────────────

const app = new Hono();

app.use("*", cors({ origin: FRONTEND_URL }));

const authRoutes = createIdServiceRoutes({
  jwtSecret: JWT_SECRET,
  userRepo,
  sessionRepo,
  profileRepo,
  serviceSchemas: schemas.services,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
  frontendUrl: FRONTEND_URL,
});

app.route("/api/auth", authRoutes);

app.get("/", (c) => {
  return c.json({
    name: "@schedula/id-service",
    description: "Standalone Identity Service",
    version: "0.2.0",
    endpoints: {
      auth: "/api/auth",
      health: "/api/auth/health",
      schema: "/api/auth/schema",
      verify: "/api/auth/verify",
    },
  });
});

// ─── サーバー起動 ────────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[id-service] サーバー起動: http://localhost:${PORT}`);
});
