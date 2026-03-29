#!/usr/bin/env tsx
/**
 * Secrets CLI — Infisical シークレット管理 CLI
 *
 * Usage:
 *   npx tsx scripts/secrets-cli.ts setup          # 対話形式で Infisical を設定
 *   npx tsx scripts/secrets-cli.ts test            # 接続テスト
 *   npx tsx scripts/secrets-cli.ts get <KEY>       # キー指定でシークレット取得
 *   npx tsx scripts/secrets-cli.ts list            # シークレット一覧
 *   npx tsx scripts/secrets-cli.ts set <KEY> <VAL> # シークレット作成/更新
 *
 * 設定ファイル: .env.secrets (Infisical bootstrap credentials)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

// ─── Constants ─────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const SECRETS_ENV_PATH = path.join(PROJECT_ROOT, ".env.secrets");
const DEFAULT_SITE_URL = "https://app.infisical.com";
const DEFAULT_ENVIRONMENT = "dev";

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
        // Disable echo for secret input
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
            // Ctrl+C
            process.exit(1);
          } else if (c === "\u007f" || c === "\b") {
            // Backspace
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
  // 1. .env.secrets ファイルから読み込み
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

  // 2. 環境変数からフォールバック
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
    // Remove surrounding quotes
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

async function setSecret(
  config: InfisicalBootstrap,
  token: string,
  key: string,
  value: string,
  secretPath = "/"
): Promise<void> {
  // Try update first, then create
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
    try {
      const token = await authenticate(config);
      const secrets = await fetchSecrets(config, token);
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
    console.log("\n次のステップ:");
    console.log("  npx tsx scripts/secrets-cli.ts test   # 接続確認");
    console.log("  npx tsx scripts/secrets-cli.ts list   # シークレット一覧");
    console.log("  npx tsx scripts/secrets-cli.ts get JWT_SECRET");
  } finally {
    prompt.close();
  }
}

async function cmdTest(): Promise<void> {
  const config = loadBootstrap();
  if (!config) {
    console.error("Error: Infisical が未設定です。先に setup を実行してください。");
    console.error("  npx tsx scripts/secrets-cli.ts setup");
    process.exit(1);
  }

  console.log("接続テスト中...");
  console.log(`  Site URL:    ${config.siteUrl}`);
  console.log(`  Project ID:  ${config.projectId}`);
  console.log(`  Environment: ${config.environment}`);

  try {
    const token = await authenticate(config);
    console.log("✓ 認証成功");

    const secrets = await fetchSecrets(config, token);
    console.log(`✓ シークレット取得成功 — ${secrets.length} 件`);
  } catch (err) {
    console.error(
      `✗ 失敗: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
}

async function cmdGet(key: string): Promise<void> {
  const config = loadBootstrap();
  if (!config) {
    console.error("Error: Infisical が未設定です。先に setup を実行してください。");
    process.exit(1);
  }

  try {
    const token = await authenticate(config);
    const value = await getSecretByKey(config, token, key);

    if (value === null) {
      console.error(`Error: シークレット "${key}" が見つかりません。`);
      process.exit(1);
    }

    // stdout に値のみ出力 (パイプ利用可能)
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
  const config = loadBootstrap();
  if (!config) {
    console.error("Error: Infisical が未設定です。先に setup を実行してください。");
    process.exit(1);
  }

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
      console.log(
        `  ${s.secretKey.padEnd(maxKeyLen)}  ${maskedValue}  (v${s.version})`
      );
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function cmdSet(key: string, value: string): Promise<void> {
  const config = loadBootstrap();
  if (!config) {
    console.error("Error: Infisical が未設定です。先に setup を実行してください。");
    process.exit(1);
  }

  try {
    const token = await authenticate(config);
    await setSecret(config, token, key, value);
    console.log(`✓ シークレット "${key}" を設定しました。`);
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
  console.log("  npm run secrets setup              対話形式で Infisical を設定");
  console.log("  npm run secrets test               接続テスト");
  console.log("  npm run secrets get <KEY>           シークレット取得");
  console.log("  npm run secrets list                シークレット一覧");
  console.log("  npm run secrets set <KEY> <VALUE>   シークレット作成/更新");
  console.log();
  console.log("設定ファイル:");
  console.log(`  ${SECRETS_ENV_PATH}`);
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
      console.error("  npm run secrets get <KEY>");
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
      console.error("  npm run secrets set <KEY> <VALUE>");
      process.exit(1);
    }
    await cmdSet(args[0], args[1]);
    break;
  default:
    printUsage();
    if (command && command !== "help" && command !== "--help" && command !== "-h") {
      process.exit(1);
    }
    break;
}
