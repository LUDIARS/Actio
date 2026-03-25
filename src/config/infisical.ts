/**
 * Infisical REST API クライアント
 *
 * Infisical からシークレットを取得・管理する低レベルクライアント。
 * Universal Auth (Machine Identity) または Service Token に対応。
 */

// ─── Types ──────────────────────────────────────────────────

export interface InfisicalConfig {
  siteUrl: string;
  projectId: string;
  environment: string;
  clientId?: string;
  clientSecret?: string;
  token?: string;
}

export interface InfisicalSecret {
  secretKey: string;
  secretValue: string;
  type: "shared" | "personal";
  version: number;
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

// ─── Client ─────────────────────────────────────────────────

export class InfisicalClient {
  private config: InfisicalConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: InfisicalConfig) {
    this.config = config;
  }

  /**
   * 認証トークンを取得 (キャッシュあり)
   */
  private async authenticate(): Promise<string> {
    if (this.config.token) {
      return this.config.token;
    }

    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("[infisical] No authentication method configured");
    }

    const res = await fetch(
      `${this.config.siteUrl}/api/v1/auth/universal-auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[infisical] Authentication failed: ${res.status} ${errText}`
      );
    }

    const data = (await res.json()) as AuthResponse;
    this.accessToken = data.accessToken;
    this.tokenExpiresAt = Date.now() + data.expiresIn * 1000;
    return data.accessToken;
  }

  /**
   * 指定パスのシークレット一覧を取得
   */
  async getSecrets(secretPath = "/"): Promise<InfisicalSecret[]> {
    const token = await this.authenticate();

    const params = new URLSearchParams({
      environment: this.config.environment,
      workspaceId: this.config.projectId,
      secretPath,
    });

    const res = await fetch(
      `${this.config.siteUrl}/api/v3/secrets/raw?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[infisical] Failed to fetch secrets: ${res.status} ${errText}`
      );
    }

    const data = (await res.json()) as SecretsResponse;
    return data.secrets.map((s) => ({
      secretKey: s.secretKey,
      secretValue: s.secretValue,
      type: (s.type === "personal" ? "personal" : "shared") as
        | "shared"
        | "personal",
      version: s.version,
    }));
  }

  /**
   * シークレットを作成
   */
  async createSecret(
    key: string,
    value: string,
    secretPath = "/",
    type: "shared" | "personal" = "shared"
  ): Promise<void> {
    const token = await this.authenticate();

    const res = await fetch(
      `${this.config.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: this.config.projectId,
          environment: this.config.environment,
          secretPath,
          secretValue: value,
          type,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[infisical] Failed to create secret: ${res.status} ${errText}`
      );
    }
  }

  /**
   * シークレットを更新
   */
  async updateSecret(
    key: string,
    value: string,
    secretPath = "/",
    type: "shared" | "personal" = "shared"
  ): Promise<void> {
    const token = await this.authenticate();

    const res = await fetch(
      `${this.config.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: this.config.projectId,
          environment: this.config.environment,
          secretPath,
          secretValue: value,
          type,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[infisical] Failed to update secret: ${res.status} ${errText}`
      );
    }
  }

  /**
   * シークレットを削除
   */
  async deleteSecret(
    key: string,
    secretPath = "/",
    type: "shared" | "personal" = "shared"
  ): Promise<void> {
    const token = await this.authenticate();

    const res = await fetch(
      `${this.config.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: this.config.projectId,
          environment: this.config.environment,
          secretPath,
          type,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[infisical] Failed to delete secret: ${res.status} ${errText}`
      );
    }
  }

  /**
   * Infisical が設定済みか
   */
  isConfigured(): boolean {
    return !!(
      this.config.token ||
      (this.config.clientId && this.config.clientSecret)
    );
  }
}

// ─── Factory ────────────────────────────────────────────────

/**
 * 環境変数からクライアントを生成。
 * 必要な設定がなければ null を返す (= Infisical 無効)。
 *
 * Bootstrap 用環境変数 (これだけは process.env から読む):
 *   INFISICAL_SITE_URL      — Infisical インスタンス URL (デフォルト: https://app.infisical.com)
 *   INFISICAL_PROJECT_ID    — プロジェクト ID (必須)
 *   INFISICAL_ENVIRONMENT   — 環境名 (デフォルト: dev)
 *   INFISICAL_CLIENT_ID     — Universal Auth クライアント ID
 *   INFISICAL_CLIENT_SECRET — Universal Auth クライアントシークレット
 *   INFISICAL_TOKEN         — Service Token (簡易認証)
 */
export function createInfisicalClient(): InfisicalClient | null {
  const siteUrl =
    process.env.INFISICAL_SITE_URL || "https://app.infisical.com";
  const projectId = process.env.INFISICAL_PROJECT_ID || "";
  const environment = process.env.INFISICAL_ENVIRONMENT || "dev";
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const token = process.env.INFISICAL_TOKEN;

  if (!projectId) return null;
  if (!token && (!clientId || !clientSecret)) return null;

  return new InfisicalClient({
    siteUrl,
    projectId,
    environment,
    clientId,
    clientSecret,
    token,
  });
}
