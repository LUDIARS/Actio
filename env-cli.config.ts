import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

const config: EnvCliConfig = {
  name: "Actio",

  /**
   * Docker Compose / アプリケーションが .env から読むインフラキー。
   * Infisical に同名キーがあればそちらを優先し、なければデフォルト値を使用。
   */
  // Legacy remote-secret CLI. Deployment settings are never uploaded by initialize.
  infraKeys: {
    JWT_SECRET: "", CERNERE_PROJECT_CLIENT_ID: "", CERNERE_PROJECT_CLIENT_SECRET: "",
    GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  },

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",

  /**
   * production 環境で env-cli env / up を実行したとき、
   * Infisical に存在しない (= dev 用 placeholder のまま) と .env 生成を中止するキー。
   * dev fallback が本番に漏れると致命的になる項目を列挙する。
   */
  required: {
    production: ["JWT_SECRET", "CERNERE_PROJECT_CLIENT_SECRET"],
  },
};

export default config;
