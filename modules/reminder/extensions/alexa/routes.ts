/**
 * Amazon Echo (Alexa) 拡張モジュール
 *
 * Alexa Custom Skill の Webhook エンドポイント。
 * 自由テキストを受け取り、パースしてリマインダーを自動登録する。
 *
 * エンドポイント:
 *   POST /webhook — Alexa からの自由テキスト受付
 *
 * 認証方式:
 *   - ヘッダー X-API-Key によるAPIキー認証
 *   - または通常のJWT認証 (テスト用)
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { reminderRepo } from "../../../../src/db/repository.js";
import { userRepo } from "../../../../src/db/repository.js";
import { parseReminderText } from "../../text-parser.js";
import { appSettingsRepo } from "../../../../src/db/repository.js";
import { getUserId } from "../../../../src/middleware/getUserId.js";

export const alexaRoutes = new Hono();

/**
 * APIキー認証ミドルウェア
 * X-API-Key ヘッダーまたは通常のJWT認証で認証する
 */
async function resolveAlexaUser(c: {
  req: { header: (name: string) => string | undefined };
  get: (key: string) => unknown;
}): Promise<{ userId: string } | { error: string }> {
  // 1. API Key 認証
  const apiKey = c.req.header("X-API-Key");
  if (apiKey) {
    const setting = await appSettingsRepo.findByKey("alexa_api_key");
    if (!setting || setting.value !== apiKey) {
      return { error: "無効なAPIキーです" };
    }
    // APIキーに紐づくユーザーIDを取得
    const userIdSetting = await appSettingsRepo.findByKey("alexa_default_user_id");
    if (!userIdSetting) {
      return { error: "Alexa連携ユーザーが設定されていません" };
    }
    return { userId: userIdSetting.value };
  }

  // 2. JWT認証 (テスト用フォールバック)
  const userId = c.get("userId") as string | undefined;
  if (userId) {
    return { userId };
  }

  return { error: "認証情報がありません (X-API-Key ヘッダーまたはJWTが必要です)" };
}

// ─── Alexa Webhook ──────────────────────────────────────────
alexaRoutes.post("/webhook", async (c) => {
  const auth = await resolveAlexaUser(c);
  if ("error" in auth) {
    return c.json({ error: auth.error }, 401);
  }

  const body = await c.req.json() as { text?: string; locale?: string };

  if (!body.text || body.text.trim() === "") {
    return c.json({ error: "text は必須です" }, 400);
  }

  // ユーザーの存在確認
  const user = await userRepo.findById(auth.userId);
  if (!user) {
    return c.json({ error: "ユーザーが見つかりません" }, 404);
  }

  const parsed = parseReminderText(body.text.trim());

  const reminder = await reminderRepo.create({
    id: randomUUID(),
    userId: auth.userId,
    title: parsed.title,
    remindAt: parsed.remindAt,
    repeatRule: "none",
    status: "pending",
    source: "alexa",
    originalText: body.text.trim(),
  });

  // Alexa 向けレスポンス (音声応答用テキストを含む)
  const remindDate = new Date(parsed.remindAt);
  const dateStr = `${remindDate.getMonth() + 1}月${remindDate.getDate()}日 ${remindDate.getHours()}時${remindDate.getMinutes().toString().padStart(2, "0")}分`;
  const speechText = `${parsed.title}のリマインダーを${dateStr}に設定しました`;

  return c.json({
    reminder,
    parsed: {
      title: parsed.title,
      remindAt: parsed.remindAt,
      confidence: parsed.confidence,
    },
    speech: speechText,
  }, 201);
});

// ─── Alexa 設定 API ──────────────────────────────────────────
// APIキーとデフォルトユーザーの設定 (管理者用)
alexaRoutes.get("/settings", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const { getUserInfo } = await import("../../../../src/auth/user-info.js");
  const user = await getUserInfo(userId);
  if (user.role !== "admin") {
    return c.json({ error: "管理者権限が必要です" }, 403);
  }

  const apiKey = await appSettingsRepo.findByKey("alexa_api_key");
  const defaultUser = await appSettingsRepo.findByKey("alexa_default_user_id");

  return c.json({
    configured: !!apiKey && !!defaultUser,
    hasApiKey: !!apiKey,
    defaultUserId: defaultUser?.value || null,
  });
});

alexaRoutes.put("/settings", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const { getUserInfo } = await import("../../../../src/auth/user-info.js");
  const user = await getUserInfo(userId);
  if (user.role !== "admin") {
    return c.json({ error: "管理者権限が必要です" }, 403);
  }

  const body = await c.req.json() as {
    generateNewApiKey?: boolean;
    defaultUserId?: string;
  };

  if (body.generateNewApiKey) {
    const newKey = `alexa_${randomUUID().replace(/-/g, "")}`;
    await appSettingsRepo.upsert("alexa_api_key", newKey);
  }

  if (body.defaultUserId) {
    const targetUser = await userRepo.findById(body.defaultUserId);
    if (!targetUser) {
      return c.json({ error: "指定されたユーザーが存在しません" }, 404);
    }
    await appSettingsRepo.upsert("alexa_default_user_id", body.defaultUserId);
  }

  const apiKey = await appSettingsRepo.findByKey("alexa_api_key");
  return c.json({
    message: "設定を更新しました",
    apiKey: body.generateNewApiKey ? apiKey?.value : undefined,
  });
});
