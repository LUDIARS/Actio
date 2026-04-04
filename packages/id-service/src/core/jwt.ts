/**
 * JWT Secret 解決ヘルパー
 */

import type { IdSecretManager } from "./types.js";
import { randomBytes } from "crypto";

export function resolveJwtSecret(secretManager: IdSecretManager): string {
  const nodeEnv = secretManager.getOrDefault("NODE_ENV", "development");
  const secret = secretManager.get("JWT_SECRET");
  if (secret) return secret;

  if (nodeEnv === "production") {
    console.error("[FATAL] JWT_SECRET is required in production");
    process.exit(1);
  }

  // 開発環境ではランダムな秘密鍵を生成（プロセス再起動でセッション無効化）
  const devSecret = randomBytes(32).toString("hex");
  console.warn(
    "[WARNING] JWT_SECRET is not set. Generated a random development secret. Sessions will not persist across restarts. Set JWT_SECRET for stable development sessions.",
  );
  return devSecret;
}
