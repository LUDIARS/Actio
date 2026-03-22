/**
 * JWT Secret configuration.
 * 本番環境では JWT_SECRET 環境変数の設定が必須。
 */

const NODE_ENV = process.env.NODE_ENV || "development";
const DEV_SECRET = "schedula-dev-secret-change-in-production";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (NODE_ENV === "production") {
    console.error("[FATAL] JWT_SECRET environment variable is required in production");
    process.exit(1);
  }

  console.warn("[WARNING] JWT_SECRET is not set. Using development default. DO NOT use in production.");
  return DEV_SECRET;
}

export const JWT_SECRET = getJwtSecret();
