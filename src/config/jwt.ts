/**
 * JWT Secret configuration.
 * Infisical → process.env → デフォルト値 (開発用) の順で解決。
 * 本番環境では JWT_SECRET の設定が必須。
 */

import { secretManager } from "./secrets.js";

const DEV_SECRET = "schedula-dev-secret-change-in-production";

function getJwtSecret(): string {
  const nodeEnv = secretManager.getOrDefault("NODE_ENV", "development");
  const secret = secretManager.get("JWT_SECRET");
  if (secret) return secret;

  if (nodeEnv === "production") {
    console.error(
      "[FATAL] JWT_SECRET is required in production"
    );
    process.exit(1);
  }

  console.warn(
    "[WARNING] JWT_SECRET is not set. Using development default. DO NOT use in production."
  );
  return DEV_SECRET;
}

export const JWT_SECRET = getJwtSecret();
