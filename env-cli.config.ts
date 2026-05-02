import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

const config: EnvCliConfig = {
  name: "Actio",

  /**
   * Docker Compose / アプリケーションが .env から読むインフラキー。
   * Infisical に同名キーがあればそちらを優先し、なければデフォルト値を使用。
   */
  infraKeys: {
    // ─── Docker Compose (Ports) ────────────────────────────
    FRONTEND_PORT: "8080",
    BACKEND_PORT: "3000",

    // ─── Standalone 用 (docker-compose.standalone.yaml) ────
    POSTGRES_USER: "actio",
    POSTGRES_PASSWORD: "actio",
    POSTGRES_DB: "actio",
    DB_PORT: "5432",
    REDIS_PORT: "6379",

    // ─── Vite ──────────────────────────────────────────────
    VITE_ALLOWED_HOSTS: "",

    // ─── Application ───────────────────────────────────────
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgresql://actio_user:actio@localhost:5432/actio",
    REDIS_URL: "redis://127.0.0.1:6379",
    FRONTEND_URL: "http://localhost:5173",
    CERNERE_URL: "http://localhost:8080",

    // ─── JWT ───────────────────────────────────────────────
    JWT_SECRET: "actio-dev-secret-change-in-production",

    // ─── Cernere プロジェクト認証 (WS接続用) ──────────────
    // Cernere で Actio をプロジェクト登録した際の client_id / client_secret
    CERNERE_PROJECT_CLIENT_ID: "",
    CERNERE_PROJECT_CLIENT_SECRET: "",

    // ─── Nuntius (LUDIARS 統合通知基盤) ─────────────────
    // 通知/リマインダーの配信先。未設定時はローカル配信にフォールバック。
    NUNTIUS_URL: "http://localhost:3100",

    // ─── Google OAuth ──────────────────────────────────────
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_REDIRECT_URI: "",
  },

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",

  /**
   * production 環境で env-cli env / up を実行したとき、
   * Infisical に存在しない (= dev 用 placeholder のまま) と .env 生成を中止するキー。
   * dev fallback が本番に漏れると致命的になる項目を列挙する。
   */
  required: {
    production: ["JWT_SECRET", "DATABASE_URL", "REDIS_URL", "CERNERE_PROJECT_CLIENT_SECRET"],
  },
};

export default config;
