/**
 * シークレットマネージャー
 *
 * 以下のプロバイダーからシークレットを取得・管理する:
 *   1. Infisical (INFISICAL_PROJECT_ID 設定時)
 *   2. AWS SSM Parameter Store (SSM_PATH_PREFIX 設定時)
 *   3. process.env フォールバック (上記いずれも未設定時)
 *
 * SECRETS_PROVIDER 環境変数で明示的にプロバイダーを選択可能:
 *   - "infisical" — Infisical を使用
 *   - "ssm"       — AWS SSM Parameter Store を使用
 *   - 未設定      — 設定されている方を自動検出 (両方あれば Infisical 優先)
 *
 * スコープ (Infisical のみ):
 *   - shared:   プロジェクトグローバル (Infisical "/" パス)
 *   - personal: 個人用オーバーライド  (Infisical "/personal" パス)
 *
 * 未設定時は process.env にフォールバックし、従来通り動作する。
 */

import { type InfisicalClient, createInfisicalClient } from "./infisical.js";
import {
  type SsmParameterStoreClient,
  createSsmClient,
} from "./ssm.js";

export type SecretScope = "shared" | "personal";
export type SecretsProviderType = "infisical" | "ssm" | "env";

interface CachedSecret {
  value: string;
  scope: SecretScope;
  updatedAt: number;
}

class SecretManager {
  private infisicalClient: InfisicalClient | null = null;
  private ssmClient: SsmParameterStoreClient | null = null;
  private activeProvider: SecretsProviderType = "env";
  private cache = new Map<string, CachedSecret>();
  private refreshIntervalMs = 5 * 60 * 1000; // 5 分
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  /**
   * 初期化: プロバイダー検出 → シークレット一括取得
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const explicitProvider = process.env.SECRETS_PROVIDER as
      | "infisical"
      | "ssm"
      | undefined;

    // プロバイダー選択
    if (explicitProvider === "ssm") {
      this.ssmClient = createSsmClient();
      if (this.ssmClient) {
        this.activeProvider = "ssm";
      }
    } else if (explicitProvider === "infisical") {
      this.infisicalClient = createInfisicalClient();
      if (this.infisicalClient) {
        this.activeProvider = "infisical";
      }
    } else {
      // 自動検出: Infisical を優先
      this.infisicalClient = createInfisicalClient();
      if (this.infisicalClient) {
        this.activeProvider = "infisical";
      } else {
        this.ssmClient = createSsmClient();
        if (this.ssmClient) {
          this.activeProvider = "ssm";
        }
      }
    }

    if (this.activeProvider !== "env") {
      const providerName =
        this.activeProvider === "infisical" ? "Infisical" : "SSM Parameter Store";
      console.log(`[secrets] ${providerName} モードで初期化中...`);
      try {
        await this.fetchAll();
        this.startAutoRefresh();
        console.log(
          `[secrets] ${providerName} から ${this.cache.size} 件のシークレットを取得`
        );
      } catch (err) {
        console.error(
          `[secrets] ${providerName} からの初回取得に失敗。環境変数フォールバックを併用:`,
          err instanceof Error ? err.message : err
        );
      }
    } else {
      console.log(
        "[secrets] 環境変数フォールバックモード (外部プロバイダー未設定)"
      );
    }

    this.initialized = true;
  }

  /**
   * 全シークレットを取得しキャッシュ更新
   */
  private async fetchAll(): Promise<void> {
    if (this.activeProvider === "infisical" && this.infisicalClient) {
      await this.fetchFromInfisical();
    } else if (this.activeProvider === "ssm" && this.ssmClient) {
      await this.fetchFromSsm();
    }
  }

  /**
   * Infisical から取得
   */
  private async fetchFromInfisical(): Promise<void> {
    if (!this.infisicalClient) return;

    // Shared secrets (プロジェクトグローバル)
    const shared = await this.infisicalClient.getSecrets("/");
    for (const s of shared) {
      this.cache.set(s.secretKey, {
        value: s.secretValue,
        scope: "shared",
        updatedAt: Date.now(),
      });
    }

    // Personal secrets (個人用オーバーライド)
    try {
      const personal = await this.infisicalClient.getSecrets("/personal");
      for (const s of personal) {
        this.cache.set(s.secretKey, {
          value: s.secretValue,
          scope: "personal",
          updatedAt: Date.now(),
        });
      }
    } catch {
      // /personal フォルダが存在しない場合は無視
    }
  }

  /**
   * SSM Parameter Store から取得
   */
  private async fetchFromSsm(): Promise<void> {
    if (!this.ssmClient) return;

    const params = await this.ssmClient.getParameters();
    for (const [key, value] of params) {
      this.cache.set(key, {
        value,
        scope: "shared",
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * 定期リフレッシュ開始
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.fetchAll().catch((err: unknown) => {
        console.error(
          "[secrets] 自動リフレッシュ失敗:",
          err instanceof Error ? err.message : err
        );
      });
    }, this.refreshIntervalMs);
    // Node プロセスが timer で停止しないように unref
    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }
  }

  // ─── Read API ───────────────────────────────────────────────

  /**
   * シークレットを取得。キャッシュ → process.env の順で探索。
   */
  get(key: string): string | undefined {
    const cached = this.cache.get(key);
    if (cached) return cached.value;
    return process.env[key];
  }

  /**
   * シークレットを取得 (必須)。見つからなければ Error。
   */
  getRequired(key: string): string {
    const value = this.get(key);
    if (value === undefined || value === "") {
      throw new Error(`[secrets] Required secret "${key}" is not set`);
    }
    return value;
  }

  /**
   * シークレットを取得し、未設定時はデフォルト値を返す。
   */
  getOrDefault(key: string, defaultValue: string): string {
    return this.get(key) ?? defaultValue;
  }

  // ─── Status API ─────────────────────────────────────────────

  /**
   * アクティブなプロバイダー種別
   */
  getProviderType(): SecretsProviderType {
    return this.activeProvider;
  }

  /**
   * Infisical が有効かどうか (後方互換)
   */
  isInfisicalEnabled(): boolean {
    return (
      this.activeProvider === "infisical" &&
      this.infisicalClient !== null &&
      this.infisicalClient.isConfigured()
    );
  }

  /**
   * SSM が有効かどうか
   */
  isSsmEnabled(): boolean {
    return (
      this.activeProvider === "ssm" &&
      this.ssmClient !== null &&
      this.ssmClient.isConfigured()
    );
  }

  /**
   * 外部プロバイダーが有効かどうか (Infisical or SSM)
   */
  isExternalProviderEnabled(): boolean {
    return this.activeProvider !== "env";
  }

  /**
   * キャッシュされたシークレット一覧 (値は含めない)
   */
  listKeys(): Array<{ key: string; scope: SecretScope; hasValue: boolean }> {
    const result: Array<{
      key: string;
      scope: SecretScope;
      hasValue: boolean;
    }> = [];
    for (const [key, cached] of this.cache.entries()) {
      result.push({ key, scope: cached.scope, hasValue: !!cached.value });
    }
    return result;
  }

  // ─── Write API (Infisical が有効な場合のみ) ─────────────────

  /**
   * 手動リフレッシュ
   */
  async refresh(): Promise<void> {
    await this.fetchAll();
  }

  /**
   * Infisical にシークレットを作成/更新
   */
  async setSecret(
    key: string,
    value: string,
    scope: SecretScope = "shared"
  ): Promise<void> {
    if (!this.infisicalClient) {
      throw new Error("[secrets] Infisical is not configured");
    }

    const path = scope === "personal" ? "/personal" : "/";

    // 更新を試み、失敗 (存在しない) なら作成
    try {
      await this.infisicalClient.updateSecret(key, value, path, scope);
    } catch {
      await this.infisicalClient.createSecret(key, value, path, scope);
    }

    this.cache.set(key, { value, scope, updatedAt: Date.now() });
  }

  /**
   * Infisical からシークレットを削除
   */
  async deleteSecret(
    key: string,
    scope: SecretScope = "shared"
  ): Promise<void> {
    if (!this.infisicalClient) {
      throw new Error("[secrets] Infisical is not configured");
    }

    const path = scope === "personal" ? "/personal" : "/";
    await this.infisicalClient.deleteSecret(key, path, scope);
    this.cache.delete(key);
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  /**
   * リフレッシュタイマー停止
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * ランタイム再初期化: process.env を再読み込みしてクライアントを再生成。
   * GUI セットアップ後に呼ばれる。
   */
  async reinit(): Promise<void> {
    this.destroy();
    this.infisicalClient = null;
    this.ssmClient = null;
    this.activeProvider = "env";
    this.cache.clear();
    this.initialized = false;
    await this.init();
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const secretManager = new SecretManager();

/**
 * アプリ起動時に呼び出す。drizzle-kit (esbuild/CJS) との互換性のため
 * top-level await ではなく明示的に呼び出す形にしている。
 */
export async function initSecrets(): Promise<void> {
  try {
    await secretManager.init();
  } catch (err) {
    console.error(
      "[secrets] 初期化中の予期しないエラー:",
      err instanceof Error ? err.message : err
    );
  }
}
