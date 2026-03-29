#!/usr/bin/env tsx
/**
 * Secrets CLI — Infisical シークレット管理 CLI
 *
 * Usage:
 *   npm run secrets -- setup              対話形式で Infisical を設定
 *   npm run secrets -- test               接続テスト
 *   npm run secrets -- get <KEY>          シークレット取得
 *   npm run secrets -- list               シークレット一覧
 *   npm run secrets -- set <KEY> <VALUE>  シークレット作成/更新
 *   npm run secrets -- env                Infisical から .env を生成 (Docker 用)
 *   npm run secrets -- env --stdout       .env 内容を標準出力
 *
 * 設定ファイル:
 *   .env.secrets  — Infisical bootstrap credentials (CLI が管理)
 *   .env          — Docker 用環境変数 (env コマンドで生成)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

// ─── Constants ─────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const SECRETS_ENV_PATH = path.join(PROJECT_ROOT, ".env.secrets");
const DOTENV_PATH = path.join(PROJECT_ROOT, ".env");
const DEFAULT_SITE_URL = "https://app.infisical.com";
const DEFAULT_ENVIRONMENT = "dev";

/**
 * Docker 起動に必要なインフラキー。
 * Infisical にこれらのキーがあれば .env に出力する。
 * Infisical に無い場合はデフォルト値を使用。
 */
const INFRA_KEYS: Record<string, string> = {
  // Ports
  FRONTEND_PORT: "8080",
  BACKEND_PORT: "3000",
  DB_PORT: "5432",
  REDIS_PORT: "6379",
  // Database
  DB_DIALECT: "postgres",
  POSTGRES_USER: "schedula",
  POSTGRES_PASSWORD: "schedula",
  POSTGRES_DB: "schedula",
  DATABASE_URL: "postgresql://schedula:schedula@db:5432/schedula",
  // Redis
  REDIS_URL: "redis://redis:6379",
};

// ─── Types ─────────────────────────────────────────────────

interface InfisicalBootstrap {
  siteUrl: string;
  projectId: string;
  environment: string;
  clientId: string;
  clientSecret: string;
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface RawSecret {
  id: string;
  secretKey: string;
  secretValue: string;
  type: string;
  version: number;
  environment: string;
  secretPath: string;
}

interface SecretsResponse {
  secrets: RawSecret[];
}

// ─── Readline Helper ───────────────────────────────────────

function createPrompt(): {
  ask: (question: string, defaultValue?: string) => Promise<string>;
  askSecret: (question: string) => Promise<string>;
  close: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask(question: string, defaultValue?: string): Promise<string> {
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      return new Promise((resolve) => {
        rl.question(`${question}${suffix}: `, (answer) => {
          resolve(answer.trim() || defaultValue || "");
        });
      });
    },

    askSecret(question: string): Promise<string> {
      return new Promise((resolve) => {
        process.stdout.write(`${question}: `);
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        if (stdin.isTTY) {
          stdin.setRawMode(true);
        }
        stdin.resume();

        let secret = "";
        const onData = (char: Buffer): void => {
          const c = char.toString("utf8");
          if (c === "\n" || c === "\r") {
            if (stdin.isTTY) {
              stdin.setRawMode(wasRaw ?? false);
            }
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            resolve(secret);
          } else if (c === "\u0003") {
            process.exit(1);
          } else if (c === "\u007f" || c === "\b") {
            if (secret.length > 0) {
              secret = secret.slice(0, -1);
              process.stdout.write("\b \b");
            }
          } else {
            secret += c;
            process.stdout.write("*");
          }
        };

        stdin.on("data", onData);
      });
    },

    close(): void {
      rl.close();
    },
  };
}

// ─── .env.secrets File I/O ─────────────────────────────────

function loadBootstrap(): InfisicalBootstrap | null {
  if (fs.existsSync(SECRETS_ENV_PATH)) {
    const content = fs.readFileSync(SECRETS_ENV_PATH, "utf-8");
    const vars = parseEnvFile(content);
    if (vars.INFISICAL_PROJECT_ID && vars.INFISICAL_CLIENT_ID && vars.INFISICAL_CLIENT_SECRET) {
      return {
        siteUrl: vars.INFISICAL_SITE_URL || DEFAULT_SITE_URL,
        projectId: vars.INFISICAL_PROJECT_ID,
        environment: vars.INFISICAL_ENVIRONMENT || DEFAULT_ENVIRONMENT,
        clientId: vars.INFISICAL_CLIENT_ID,
        clientSecret: vars.INFISICAL_CLIENT_SECRET,
      };
    }
  }

  if (
    process.env.INFISICAL_PROJECT_ID &&
    process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET
  ) {
    return {
      siteUrl: process.env.INFISICAL_SITE_URL || DEFAULT_SITE_URL,
      projectId: process.env.INFISICAL_PROJECT_ID,
      environment: process.env.INFISICAL_ENVIRONMENT || DEFAULT_ENVIRONMENT,
      clientId: process.env.INFISICAL_CLIENT_ID,
      clientSecret: process.env.INFISICAL_CLIENT_SECRET,
    };
  }

  return null;
}

function saveBootstrap(config: InfisicalBootstrap): void {
  const lines = [
    "# ─── Infisical Bootstrap Credentials ─────────────────────────",
    "# secrets-cli setup で自動生成。このファイルは .gitignore に含まれる。",
    "# ─────────────────────────────────────────────────────────────",
    "",
    `INFISICAL_SITE_URL=${config.siteUrl}`,
    `INFISICAL_PROJECT_ID=${config.projectId}`,
    `INFISICAL_ENVIRONMENT=${config.environment}`,
    `INFISICAL_CLIENT_ID=${config.clientId}`,
    `INFISICAL_CLIENT_SECRET=${config.clientSecret}`,
    "",
  ];
  fs.writeFileSync(SECRETS_ENV_PATH, lines.join("\n"), "utf-8");
}

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ─── Infisical API ─────────────────────────────────────────

async function authenticate(config: InfisicalBootstrap): Promise<string> {
  const res = await fetch(
    `${config.siteUrl}/api/v1/auth/universal-auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Authentication failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as AuthResponse;
  return data.accessToken;
}

async function fetchSecrets(
  config: InfisicalBootstrap,
  token: string,
  secretPath = "/"
): Promise<RawSecret[]> {
  const params = new URLSearchParams({
    environment: config.environment,
    workspaceId: config.projectId,
    secretPath,
  });

  const res = await fetch(
    `${config.siteUrl}/api/v3/secrets/raw?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch secrets: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as SecretsResponse;
  return data.secrets;
}

async function getSecretByKey(
  config: InfisicalBootstrap,
  token: string,
  key: string,
  secretPath = "/"
): Promise<string | null> {
  const secrets = await fetchSecrets(config, token, secretPath);
  const found = secrets.find((s) => s.secretKey === key);
  return found ? found.secretValue : null;
}

async function upsertSecret(
  config: InfisicalBootstrap,
  token: string,
  key: string,
  value: string,
  secretPath = "/"
): Promise<void> {
  const updateRes = await fetch(
    `${config.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: config.projectId,
        environment: config.environment,
        secretPath,
        secretValue: value,
        type: "shared",
      }),
    }
  );

  if (updateRes.ok) return;

  const createRes = await fetch(
    `${config.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: config.projectId,
        environment: config.environment,
        secretPath,
        secretValue: value,
        type: "shared",
      }),
    }
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to set secret: ${createRes.status} ${errText}`);
  }
}

// ─── .env Generator ────────────────────────────────────────

function requireBootstrap(): InfisicalBootstrap {
  const config = loadBootstrap();
  if (!config) {
    console.error("Error: Infisical が未設定です。先に setup を実行してください。");
    console.error("  npm run secrets -- setup");
    process.exit(1);
  }
  return config;
}

/**
 * Infisical から取得したシークレットをもとに Docker 用 .env を生成する。
 *
 * 分類:
 *   - インフラキー (INFRA_KEYS) → .env に出力 (Docker が直接使用)
 *   - Infisical bootstrap   → .env に出力 (バックエンドが SecretManager で使用)
 *   - それ以外              → .env には書かない (バックエンドがランタイムで取得)
 */
function buildDotenv(
  secrets: RawSecret[],
  bootstrap: InfisicalBootstrap,
): string {
  const secretMap = new Map<string, string>();
  for (const s of secrets) {
    secretMap.set(s.secretKey, s.secretValue);
  }

  const lines: string[] = [
    "# ═══════════════════════════════════════════════════════════════",
    "# Schedula — Docker 環境変数 (自動生成)",
    `# Generated: ${new Date().toISOString()}`,
    "# Source: Infisical (${bootstrap.environment})",
    "#",
    "# このファイルは secrets-cli env で再生成できます。",
    "# 手動編集しても次回の env 実行で上書きされます。",
    "# ═══════════════════════════════════════════════════════════════",
    "",
    "# ─── Infrastructure (Docker Compose 用) ──────────────────────",
  ];

  // Infra keys: Infisical にあればその値、なければデフォルト
  for (const [key, defaultValue] of Object.entries(INFRA_KEYS)) {
    const value = secretMap.get(key) ?? defaultValue;
    lines.push(`${key}=${value}`);
  }

  lines.push("");
  lines.push("# ─── Infisical Bootstrap (バックエンド用) ────────────────────");
  lines.push(`SECRETS_PROVIDER=infisical`);
  lines.push(`INFISICAL_SITE_URL=${bootstrap.siteUrl}`);
  lines.push(`INFISICAL_PROJECT_ID=${bootstrap.projectId}`);
  lines.push(`INFISICAL_ENVIRONMENT=${bootstrap.environment}`);
  lines.push(`INFISICAL_CLIENT_ID=${bootstrap.clientId}`);
  lines.push(`INFISICAL_CLIENT_SECRET=${bootstrap.clientSecret}`);
  lines.push("");

  // ランタイムで取得されるキーを一覧として記載 (参考用コメント)
  const runtimeKeys = secrets
    .map((s) => s.secretKey)
    .filter((k) => !(k in INFRA_KEYS));

  if (runtimeKeys.length > 0) {
    lines.push("# ─── Runtime Secrets (バックエンドが Infisical から自動取得) ──");
    lines.push(`# 以下の ${runtimeKeys.length} 件はサービス内で SecretManager 経由で取得:`);
    for (const key of runtimeKeys) {
      lines.push(`#   ${key}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Commands ──────────────────────────────────────────────

async function cmdSetup(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Schedula Secrets CLI — Infisical Setup     ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();

  const existing = loadBootstrap();
  if (existing) {
    console.log("既存の設定が見つかりました:");
    console.log(`  Site URL:    ${existing.siteUrl}`);
    console.log(`  Project ID:  ${existing.projectId}`);
    console.log(`  Environment: ${existing.environment}`);
    console.log(`  Client ID:   ${existing.clientId.slice(0, 8)}...`);
    console.log();
  }

  const prompt = createPrompt();

  try {
    const siteUrl = await prompt.ask(
      "Infisical Site URL",
      existing?.siteUrl || DEFAULT_SITE_URL
    );
    const projectId = await prompt.ask(
      "Project ID",
      existing?.projectId
    );
    if (!projectId) {
      console.error("Error: Project ID は必須です。");
      process.exit(1);
    }

    const environment = await prompt.ask(
      "Environment",
      existing?.environment || DEFAULT_ENVIRONMENT
    );
    const clientId = await prompt.ask(
      "Client ID (Universal Auth)",
      existing?.clientId
    );
    if (!clientId) {
      console.error("Error: Client ID は必須です。");
      process.exit(1);
    }

    const clientSecret = await prompt.askSecret("Client Secret");
    if (!clientSecret) {
      console.error("Error: Client Secret は必須です。");
      process.exit(1);
    }

    const config: InfisicalBootstrap = {
      siteUrl,
      projectId,
      environment,
      clientId,
      clientSecret,
    };

    // 接続テスト
    console.log("\n接続テスト中...");
    let secrets: RawSecret[] = [];
    try {
      const token = await authenticate(config);
      secrets = await fetchSecrets(config, token);
      console.log(`✓ 接続成功 — ${secrets.length} 件のシークレットを確認`);
    } catch (err) {
      console.error(
        `✗ 接続失敗: ${err instanceof Error ? err.message : err}`
      );
      const proceed = await prompt.ask("設定を保存しますか? (y/N)", "N");
      if (proceed.toLowerCase() !== "y") {
        console.log("中断しました。");
        process.exit(1);
      }
    }

    // 保存
    saveBootstrap(config);
    console.log(`\n設定を保存しました: ${SECRETS_ENV_PATH}`);

    // .env 自動生成を提案
    if (secrets.length > 0) {
      const genEnv = await prompt.ask("Docker 用 .env を生成しますか? (Y/n)", "Y");
      if (genEnv.toLowerCase() !== "n") {
        const dotenvContent = buildDotenv(secrets, config);
        fs.writeFileSync(DOTENV_PATH, dotenvContent, "utf-8");
        console.log(`✓ ${DOTENV_PATH} を生成しました。`);
      }
    }

    console.log("\n次のステップ:");
    console.log("  npm run secrets -- env    # .env 再生成");
    console.log("  npm run secrets -- list   # シークレット一覧");
    console.log("  npm run setup            # Docker 起動");
  } finally {
    prompt.close();
  }
}

async function cmdTest(): Promise<void> {
  const config = requireBootstrap();

  console.log("接続テスト中...");
  console.log(`  Site URL:    ${config.siteUrl}`);
  console.log(`  Project ID:  ${config.projectId}`);
  console.log(`  Environment: ${config.environment}`);

  try {
    const token = await authenticate(config);
    console.log("✓ 認証成功");

    const secrets = await fetchSecrets(config, token);
    console.log(`✓ シークレット取得成功 — ${secrets.length} 件`);

    // インフラキーの有無をチェック
    const secretKeys = new Set(secrets.map((s) => s.secretKey));
    const missingInfra = Object.keys(INFRA_KEYS).filter((k) => !secretKeys.has(k));
    if (missingInfra.length > 0) {
      console.log(`\n  ℹ Infisical に未登録のインフラキー (デフォルト値を使用):`);
      for (const key of missingInfra) {
        console.log(`    ${key} = ${INFRA_KEYS[key]}`);
      }
    }
  } catch (err) {
    console.error(
      `✗ 失敗: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
}

async function cmdGet(key: string): Promise<void> {
  const config = requireBootstrap();

  try {
    const token = await authenticate(config);
    const value = await getSecretByKey(config, token, key);

    if (value === null) {
      console.error(`Error: シークレット "${key}" が見つかりません。`);
      process.exit(1);
    }

    process.stdout.write(value);
    if (process.stdout.isTTY) {
      process.stdout.write("\n");
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function cmdList(): Promise<void> {
  const config = requireBootstrap();

  try {
    const token = await authenticate(config);
    const secrets = await fetchSecrets(config, token);

    if (secrets.length === 0) {
      console.log("シークレットが登録されていません。");
      return;
    }

    console.log(`\n${config.environment} 環境のシークレット (${secrets.length} 件):\n`);

    const maxKeyLen = Math.max(...secrets.map((s) => s.secretKey.length));
    for (const s of secrets) {
      const maskedValue =
        s.secretValue.length > 4
          ? s.secretValue.slice(0, 2) + "***" + s.secretValue.slice(-2)
          : "***";
      const tag = s.secretKey in INFRA_KEYS ? "  [infra]" : "";
      console.log(
        `  ${s.secretKey.padEnd(maxKeyLen)}  ${maskedValue}  (v${s.version})${tag}`
      );
    }

    console.log();
    console.log("  [infra] = Docker .env に出力されるインフラキー");
    console.log("  それ以外 = バックエンドが SecretManager 経由でランタイム取得");
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function cmdSet(key: string, value: string): Promise<void> {
  const config = requireBootstrap();

  try {
    const token = await authenticate(config);
    await upsertSecret(config, token, key, value);
    console.log(`✓ シークレット "${key}" を設定しました。`);

    if (key in INFRA_KEYS) {
      console.log(`  ℹ インフラキーが更新されました。.env を再生成してください:`);
      console.log(`    npm run secrets -- env`);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function cmdEnv(toStdout: boolean): Promise<void> {
  const config = requireBootstrap();

  try {
    const token = await authenticate(config);
    const secrets = await fetchSecrets(config, token);

    const dotenvContent = buildDotenv(secrets, config);

    if (toStdout) {
      process.stdout.write(dotenvContent);
    } else {
      fs.writeFileSync(DOTENV_PATH, dotenvContent, "utf-8");
      console.log(`✓ ${DOTENV_PATH} を生成しました。`);

      // Summary
      const infraCount = secrets.filter((s) => s.secretKey in INFRA_KEYS).length;
      const runtimeCount = secrets.length - infraCount;
      console.log(`  インフラキー: ${infraCount} 件 (Infisical) + ${Object.keys(INFRA_KEYS).length - infraCount} 件 (デフォルト)`);
      console.log(`  ランタイム:   ${runtimeCount} 件 (SecretManager が自動取得)`);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

// ─── Main ──────────────────────────────────────────────────

function printUsage(): void {
  console.log("Schedula Secrets CLI — Infisical シークレット管理");
  console.log();
  console.log("Usage:");
  console.log("  npm run secrets -- setup              対話形式で Infisical を設定");
  console.log("  npm run secrets -- test               接続テスト");
  console.log("  npm run secrets -- get <KEY>          シークレット取得");
  console.log("  npm run secrets -- list               シークレット一覧");
  console.log("  npm run secrets -- set <KEY> <VALUE>  シークレット作成/更新");
  console.log("  npm run secrets -- env                Infisical → .env 生成");
  console.log("  npm run secrets -- env --stdout       .env 内容を標準出力");
  console.log();
  console.log("設定ファイル:");
  console.log(`  ${SECRETS_ENV_PATH}  — Infisical 認証情報`);
  console.log(`  ${DOTENV_PATH}            — Docker 用環境変数 (生成)`);
  console.log();
  console.log("フロー:");
  console.log("  1. setup → Infisical 認証情報を .env.secrets に保存");
  console.log("  2. env   → Infisical から取得 → Docker 用 .env を生成");
  console.log("  3. docker compose up → .env を読んで起動");
  console.log("  4. バックエンド内で SecretManager が残りのシークレットを取得");
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "setup":
    await cmdSetup();
    break;
  case "test":
    await cmdTest();
    break;
  case "get":
    if (!args[0]) {
      console.error("Error: キーを指定してください。");
      console.error("  npm run secrets -- get <KEY>");
      process.exit(1);
    }
    await cmdGet(args[0]);
    break;
  case "list":
    await cmdList();
    break;
  case "set":
    if (!args[0] || !args[1]) {
      console.error("Error: キーと値を指定してください。");
      console.error("  npm run secrets -- set <KEY> <VALUE>");
      process.exit(1);
    }
    await cmdSet(args[0], args[1]);
    break;
  case "env":
    await cmdEnv(args.includes("--stdout"));
    break;
  default:
    printUsage();
    if (command && command !== "help" && command !== "--help" && command !== "-h") {
      process.exit(1);
    }
    break;
}
