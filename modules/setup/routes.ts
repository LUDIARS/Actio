/**
 * 初回セットアップ API (認証不要)
 *
 * Infisical 接続情報が未設定の場合に GUI セットアップを案内する。
 * セットアップ完了後は .env に書き込み、SecretManager を再初期化する。
 */

import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { secretManager } from "../../src/config/secrets.js";

const setupRoutes = new Hono();

/** プロジェクトルートの .env ファイルパス */
const ENV_FILE = resolve(process.cwd(), ".env");

/** セットアップスキップマーカーファイル */
const SETUP_SKIP_MARKER = resolve(process.cwd(), ".setup-skipped");

// ─── Types ──────────────────────────────────────────────────

interface InfisicalSetupBody {
  siteUrl?: string;
  projectId: string;
  environment?: string;
  authMethod: "universal" | "token";
  clientId?: string;
  clientSecret?: string;
  token?: string;
}

interface SetupStatusResponse {
  needsSetup: boolean;
  infisicalConfigured: boolean;
  setupSkipped: boolean;
}

interface SetupResultResponse {
  success: boolean;
  message: string;
  infisicalEnabled: boolean;
}

// ─── GET /status — セットアップが必要か判定 ──────────────────

setupRoutes.get("/status", (c) => {
  const infisicalConfigured = secretManager.isInfisicalEnabled();
  const setupSkipped = existsSync(SETUP_SKIP_MARKER);

  const needsSetup = !infisicalConfigured && !setupSkipped;

  const response: SetupStatusResponse = {
    needsSetup,
    infisicalConfigured,
    setupSkipped,
  };
  return c.json(response);
});

// ─── POST /infisical — Infisical 設定を保存して再初期化 ─────

setupRoutes.post("/infisical", async (c) => {
  const body = await c.req.json<InfisicalSetupBody>();

  // バリデーション
  if (!body.projectId?.trim()) {
    return c.json({ error: "プロジェクト ID は必須です" }, 400);
  }

  if (body.authMethod === "universal") {
    if (!body.clientId?.trim() || !body.clientSecret?.trim()) {
      return c.json(
        { error: "Universal Auth にはクライアント ID とクライアントシークレットが必要です" },
        400
      );
    }
  } else if (body.authMethod === "token") {
    if (!body.token?.trim()) {
      return c.json({ error: "Service Token は必須です" }, 400);
    }
  } else {
    return c.json({ error: "認証方式は 'universal' または 'token' を指定してください" }, 400);
  }

  // .env ファイルに追記 (既存内容を保持)
  const envLines: string[] = [];
  envLines.push("");
  envLines.push("# ─── Infisical (GUI セットアップで追加) ──────────────────");
  envLines.push(`INFISICAL_PROJECT_ID=${body.projectId.trim()}`);
  envLines.push(`INFISICAL_ENVIRONMENT=${body.environment?.trim() || "dev"}`);

  if (body.siteUrl?.trim() && body.siteUrl.trim() !== "https://app.infisical.com") {
    envLines.push(`INFISICAL_SITE_URL=${body.siteUrl.trim()}`);
  }

  if (body.authMethod === "universal") {
    envLines.push(`INFISICAL_CLIENT_ID=${body.clientId!.trim()}`);
    envLines.push(`INFISICAL_CLIENT_SECRET=${body.clientSecret!.trim()}`);
  } else {
    envLines.push(`INFISICAL_TOKEN=${body.token!.trim()}`);
  }

  try {
    // .env ファイルに追記
    appendFileSync(ENV_FILE, envLines.join("\n") + "\n", "utf-8");

    // process.env を更新 (ランタイムで反映)
    process.env.INFISICAL_PROJECT_ID = body.projectId.trim();
    process.env.INFISICAL_ENVIRONMENT = body.environment?.trim() || "dev";

    if (body.siteUrl?.trim()) {
      process.env.INFISICAL_SITE_URL = body.siteUrl.trim();
    }

    if (body.authMethod === "universal") {
      process.env.INFISICAL_CLIENT_ID = body.clientId!.trim();
      process.env.INFISICAL_CLIENT_SECRET = body.clientSecret!.trim();
      delete process.env.INFISICAL_TOKEN;
    } else {
      process.env.INFISICAL_TOKEN = body.token!.trim();
      delete process.env.INFISICAL_CLIENT_ID;
      delete process.env.INFISICAL_CLIENT_SECRET;
    }

    // SecretManager を再初期化
    await secretManager.reinit();

    // スキップマーカーがあれば削除
    if (existsSync(SETUP_SKIP_MARKER)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(SETUP_SKIP_MARKER);
    }

    const response: SetupResultResponse = {
      success: true,
      message: "Infisical の設定を保存しました。シークレットマネージャーを再初期化しました。",
      infisicalEnabled: secretManager.isInfisicalEnabled(),
    };
    return c.json(response);
  } catch (err) {
    console.error("[setup] Infisical 設定エラー:", err);
    return c.json(
      {
        error: err instanceof Error ? err.message : "設定の保存に失敗しました",
      },
      500
    );
  }
});

// ─── POST /test-connection — 接続テスト (保存せず) ──────────

setupRoutes.post("/test-connection", async (c) => {
  const body = await c.req.json<InfisicalSetupBody>();

  if (!body.projectId?.trim()) {
    return c.json({ error: "プロジェクト ID は必須です" }, 400);
  }

  const { InfisicalClient } = await import("../../src/config/infisical.js");

  const config = {
    siteUrl: body.siteUrl?.trim() || "https://app.infisical.com",
    projectId: body.projectId.trim(),
    environment: body.environment?.trim() || "dev",
    clientId: body.authMethod === "universal" ? body.clientId?.trim() : undefined,
    clientSecret: body.authMethod === "universal" ? body.clientSecret?.trim() : undefined,
    token: body.authMethod === "token" ? body.token?.trim() : undefined,
  };

  const client = new InfisicalClient(config);

  try {
    const secrets = await client.getSecrets("/");
    return c.json({
      success: true,
      message: `接続成功: ${secrets.length} 件のシークレットを検出しました`,
      secretCount: secrets.length,
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "接続に失敗しました",
      },
      400
    );
  }
});

// ─── POST /skip — セットアップをスキップ ────────────────────

setupRoutes.post("/skip", (c) => {
  try {
    writeFileSync(SETUP_SKIP_MARKER, new Date().toISOString(), "utf-8");
    return c.json({
      success: true,
      message: "セットアップをスキップしました。環境変数フォールバックモードで動作します。",
    });
  } catch (err) {
    console.error("[setup] スキップマーカー書き込みエラー:", err);
    return c.json(
      { error: "スキップの記録に失敗しました" },
      500
    );
  }
});

// ─── GET /env-check — 現在の .env ファイルの Infisical 関連設定を確認 ──

setupRoutes.get("/env-check", (c) => {
  const hasEnvFile = existsSync(ENV_FILE);
  let hasInfisicalConfig = false;

  if (hasEnvFile) {
    try {
      const content = readFileSync(ENV_FILE, "utf-8");
      hasInfisicalConfig = content.includes("INFISICAL_PROJECT_ID=");
    } catch {
      // ファイル読み取りエラーは無視
    }
  }

  return c.json({
    hasEnvFile,
    hasInfisicalConfig,
    envVars: {
      INFISICAL_PROJECT_ID: !!process.env.INFISICAL_PROJECT_ID,
      INFISICAL_ENVIRONMENT: !!process.env.INFISICAL_ENVIRONMENT,
      INFISICAL_CLIENT_ID: !!process.env.INFISICAL_CLIENT_ID,
      INFISICAL_CLIENT_SECRET: !!process.env.INFISICAL_CLIENT_SECRET,
      INFISICAL_TOKEN: !!process.env.INFISICAL_TOKEN,
      INFISICAL_SITE_URL: !!process.env.INFISICAL_SITE_URL,
    },
  });
});

export { setupRoutes };
