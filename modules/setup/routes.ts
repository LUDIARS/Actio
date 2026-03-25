/**
 * 初回セットアップ API (認証不要)
 *
 * シークレットプロバイダー (Infisical / SSM Parameter Store) の接続情報が
 * 未設定の場合に GUI セットアップを案内する。
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

interface SsmSetupBody {
  region: string;
  pathPrefix: string;
}

interface SetupStatusResponse {
  needsSetup: boolean;
  infisicalConfigured: boolean;
  ssmConfigured: boolean;
  providerType: string;
  setupSkipped: boolean;
}

interface SetupResultResponse {
  success: boolean;
  message: string;
  infisicalEnabled: boolean;
  ssmEnabled?: boolean;
  providerType?: string;
}

// ─── GET /status — セットアップが必要か判定 ──────────────────

setupRoutes.get("/status", (c) => {
  const infisicalConfigured = secretManager.isInfisicalEnabled();
  const ssmConfigured = secretManager.isSsmEnabled();
  const setupSkipped = existsSync(SETUP_SKIP_MARKER);

  const needsSetup = !infisicalConfigured && !ssmConfigured && !setupSkipped;

  const response: SetupStatusResponse = {
    needsSetup,
    infisicalConfigured,
    ssmConfigured,
    providerType: secretManager.getProviderType(),
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
  envLines.push("SECRETS_PROVIDER=infisical");
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
    process.env.SECRETS_PROVIDER = "infisical";
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

    // SSM 関連をクリア
    delete process.env.SSM_PATH_PREFIX;

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
      providerType: secretManager.getProviderType(),
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

// ─── POST /ssm — SSM Parameter Store 設定を保存して再初期化 ──

setupRoutes.post("/ssm", async (c) => {
  const body = await c.req.json<SsmSetupBody>();

  // バリデーション
  if (!body.pathPrefix?.trim()) {
    return c.json({ error: "パスプレフィックスは必須です" }, 400);
  }

  if (!body.region?.trim()) {
    return c.json({ error: "AWS リージョンは必須です" }, 400);
  }

  // .env ファイルに追記
  const envLines: string[] = [];
  envLines.push("");
  envLines.push("# ─── AWS SSM Parameter Store (GUI セットアップで追加) ────");
  envLines.push("SECRETS_PROVIDER=ssm");
  envLines.push(`SSM_PATH_PREFIX=${body.pathPrefix.trim()}`);
  envLines.push(`AWS_REGION=${body.region.trim()}`);

  try {
    appendFileSync(ENV_FILE, envLines.join("\n") + "\n", "utf-8");

    // process.env を更新
    process.env.SECRETS_PROVIDER = "ssm";
    process.env.SSM_PATH_PREFIX = body.pathPrefix.trim();
    process.env.AWS_REGION = body.region.trim();

    // Infisical 関連をクリア
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_TOKEN;

    // SecretManager を再初期化
    await secretManager.reinit();

    // スキップマーカーがあれば削除
    if (existsSync(SETUP_SKIP_MARKER)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(SETUP_SKIP_MARKER);
    }

    const response: SetupResultResponse = {
      success: true,
      message: "SSM Parameter Store の設定を保存しました。シークレットマネージャーを再初期化しました。",
      infisicalEnabled: false,
      ssmEnabled: secretManager.isSsmEnabled(),
      providerType: secretManager.getProviderType(),
    };
    return c.json(response);
  } catch (err) {
    console.error("[setup] SSM 設定エラー:", err);
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

// ─── POST /test-ssm — SSM 接続テスト (保存せず) ─────────────

setupRoutes.post("/test-ssm", async (c) => {
  const body = await c.req.json<SsmSetupBody>();

  if (!body.pathPrefix?.trim()) {
    return c.json({ error: "パスプレフィックスは必須です" }, 400);
  }

  const { SsmParameterStoreClient } = await import("../../src/config/ssm.js");

  const client = new SsmParameterStoreClient({
    region: body.region?.trim() || "ap-northeast-1",
    pathPrefix: body.pathPrefix.trim(),
  });

  try {
    const count = await client.testConnection();
    return c.json({
      success: true,
      message: `接続成功: ${count} 件のパラメータを検出しました`,
      secretCount: count,
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

// ─── POST /ssm-secrets — SSM にアプリ環境変数を一括登録 ─────

setupRoutes.post("/ssm-secrets", async (c) => {
  const body = await c.req.json<{
    region: string;
    pathPrefix: string;
    secrets: Record<string, string>;
  }>();

  if (!body.pathPrefix?.trim()) {
    return c.json({ error: "パスプレフィックスは必須です" }, 400);
  }
  if (!body.secrets || Object.keys(body.secrets).length === 0) {
    return c.json({ error: "登録するシークレットがありません" }, 400);
  }

  const { SsmParameterStoreClient } = await import("../../src/config/ssm.js");

  const client = new SsmParameterStoreClient({
    region: body.region?.trim() || "ap-northeast-1",
    pathPrefix: body.pathPrefix.trim(),
  });

  try {
    const result = await client.putParameters(body.secrets);

    if (result.errors.length > 0) {
      return c.json({
        success: false,
        message: `${result.written} 件登録、${result.errors.length} 件失敗`,
        written: result.written,
        errors: result.errors,
      }, 400);
    }

    return c.json({
      success: true,
      message: `${result.written} 件のシークレットを SSM に登録しました`,
      written: result.written,
      errors: [],
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "SSM への書き込みに失敗しました",
      },
      500
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

// ─── GET /env-check — 現在の .env ファイルの設定を確認 ───────

setupRoutes.get("/env-check", (c) => {
  const hasEnvFile = existsSync(ENV_FILE);
  let hasInfisicalConfig = false;
  let hasSsmConfig = false;

  if (hasEnvFile) {
    try {
      const content = readFileSync(ENV_FILE, "utf-8");
      hasInfisicalConfig = content.includes("INFISICAL_PROJECT_ID=");
      hasSsmConfig = content.includes("SSM_PATH_PREFIX=");
    } catch {
      // ファイル読み取りエラーは無視
    }
  }

  return c.json({
    hasEnvFile,
    hasInfisicalConfig,
    hasSsmConfig,
    envVars: {
      SECRETS_PROVIDER: !!process.env.SECRETS_PROVIDER,
      INFISICAL_PROJECT_ID: !!process.env.INFISICAL_PROJECT_ID,
      INFISICAL_ENVIRONMENT: !!process.env.INFISICAL_ENVIRONMENT,
      INFISICAL_CLIENT_ID: !!process.env.INFISICAL_CLIENT_ID,
      INFISICAL_CLIENT_SECRET: !!process.env.INFISICAL_CLIENT_SECRET,
      INFISICAL_TOKEN: !!process.env.INFISICAL_TOKEN,
      INFISICAL_SITE_URL: !!process.env.INFISICAL_SITE_URL,
      SSM_PATH_PREFIX: !!process.env.SSM_PATH_PREFIX,
      AWS_REGION: !!process.env.AWS_REGION,
    },
  });
});

export { setupRoutes };
