import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

const config: EnvCliConfig = {
  name: "Schedula",

  /**
   * Docker Compose / アプリケーションが .env から読むインフラキー。
   * Infisical に同名キーがあればそちらを優先し、なければデフォルト値を使用。
   */
  infraKeys: {
    // ─── Docker Compose (Ports) ────────────────────────────
    FRONTEND_PORT: "8080",
    BACKEND_PORT: "3000",

    // ─── Standalone 用 (docker-compose.standalone.yaml) ────
    POSTGRES_USER: "schedula",
    POSTGRES_PASSWORD: "schedula",
    POSTGRES_DB: "schedula",
    DB_PORT: "5432",
    REDIS_PORT: "6379",

    // ─── Vite ──────────────────────────────────────────────
    VITE_ALLOWED_HOSTS: "",

    // ─── Application ───────────────────────────────────────
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgresql://schedula_user:schedula@localhost:5432/schedula",
    REDIS_URL: "redis://127.0.0.1:6379",
    FRONTEND_URL: "http://localhost:5173",
    CERNERE_URL: "http://localhost:8080",

    // ─── JWT ───────────────────────────────────────────────
    JWT_SECRET: "schedula-dev-secret-change-in-production",

    // ─── Google OAuth ──────────────────────────────────────
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_REDIRECT_URI: "",
  },

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",
};

export default config;
