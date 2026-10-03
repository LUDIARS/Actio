/** Read-only secrets from environment, Excubitor Vault, or SSM. */

import { applyLocalConfig, LOCAL_SETTING_KEYS } from "./local-config.js";
import { applyExcubitorEndpoints } from "./service-endpoints.js";
import { readSecretSource } from "./secret-source.js";
import { applyExcubitorServiceConfig } from "./excubitor/service-config.js";
import { resolveSecretsFromExcubitor } from "./excubitor/secret-agent-client.js";
import {
  type SsmParameterStoreClient,
  createSsmClient,
} from "./ssm.js";

export type SecretScope = "shared" | "personal";
export type SecretsProviderType = "ssm" | "env";

interface CachedSecret {
  value: string;
  scope: SecretScope;
  updatedAt: number;
}

class SecretManager {
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

    // Excubitor の runtime-config (ACTIO_CONFIG_KEY 等) を先に展開しないと暗号化 config を開けない。
    applyExcubitorServiceConfig();
    applyExcubitorEndpoints();
    applyLocalConfig();
    const explicitProvider = process.env.SECRETS_PROVIDER;
    if (explicitProvider && !["env", "ssm"].includes(explicitProvider)) throw new Error("Invalid SECRETS_PROVIDER");

    // プロバイダー選択
    if (explicitProvider === "env") {
      this.activeProvider = "env";
    } else if (explicitProvider === "ssm") {
      this.ssmClient = createSsmClient();
      if (this.ssmClient) {
        this.activeProvider = "ssm";
      }
    } else {
      this.ssmClient = createSsmClient();
      if (this.ssmClient) this.activeProvider = "ssm";
    }

    if (explicitProvider && explicitProvider !== "env" && this.activeProvider === "env") throw new Error("Selected secret provider is not configured");

    if (this.activeProvider !== "env") {
      const providerName = "SSM Parameter Store";
      console.log(`[secrets] ${providerName} モードで初期化中...`);
      try {
        await this.fetchAll();
        console.log(
          `[secrets] ${providerName} から ${this.cache.size} 件のシークレットを取得`
        );
      } catch {
        throw new Error("Selected secret provider could not be initialized");
      }
    } else {
      console.log(
        "[secrets] 環境変数フォールバックモード (外部プロバイダー未設定)"
      );
    }

    await this.loadSecretSource();
    if (this.activeProvider !== "env") this.startAutoRefresh();

    this.initialized = true;
  }

  /**
   * 暗号化ローカル config が指す取得元の secret を Excubitor の secret-agent から受け取る。
   * プロバイダー選択とは独立。取得元が設定されているのに受け取れない場合は起動を止める
   * (黙って secret 無しで動かさない)。値はこのキャッシュ (メモリ) にだけ置く。
   */
  private async loadSecretSource(): Promise<void> {
    const source = readSecretSource();
    if (!source) return;
    const secrets = await resolveSecretsFromExcubitor(source);
    // Replace only after the whole response has been validated.
    for (const key of source.keys) this.cache.delete(key);
    for (const [key, value] of secrets) {
      this.cache.set(key, { value, scope: "shared", updatedAt: Date.now() });
    }
    const absent = source.keys.filter((key) => !secrets.has(key));
    // 名前だけを出す。必須のものは後続の getRequired が起動を止める。
    if (absent.length > 0) console.warn(`[secrets] secret source has no value for: ${absent.join(", ")}`);
    console.log(`[secrets] Excubitor secret-agent から ${secrets.size} 件のシークレットを取得`);
  }

  /**
   * 全シークレットを取得しキャッシュ更新
   */
  private async fetchAll(): Promise<void> {
    if (this.activeProvider === "ssm" && this.ssmClient) {
      await this.fetchFromSsm();
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
   * 注入値・暗号化ローカル設定を優先し、外部シークレットを補完する。
   */
  get(key: string): string | undefined {
    if (process.env[key] !== undefined) return process.env[key];
    if (LOCAL_SETTING_KEYS.has(key)) return undefined;
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
   * 外部プロバイダーが有効かどうか (Vault or SSM)
   */
  isExternalProviderEnabled(): boolean {
    return this.activeProvider !== "env" || readSecretSource() !== null;
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
      if (LOCAL_SETTING_KEYS.has(key)) continue;
      result.push({ key, scope: cached.scope, hasValue: !!cached.value });
    }
    return result;
  }

  /** 手動リフレッシュ。Vault の値も再取得する。 */
  async refresh(): Promise<void> {
    await this.fetchAll();
    await this.loadSecretSource();
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
  await secretManager.init();
}
