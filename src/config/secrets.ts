/**
 * シークレットマネージャー
 *
 * Infisical (設定時) または process.env からシークレットを取得・管理する。
 * 起動時に Infisical から一括取得しキャッシュ、定期的にリフレッシュする。
 *
 * スコープ:
 *   - shared:   プロジェクトグローバル (Infisical "/" パス)
 *   - personal: 個人用オーバーライド  (Infisical "/personal" パス)
 *
 * Infisical 未設定時は process.env にフォールバックし、従来通り動作する。
 */

import { type InfisicalClient, createInfisicalClient } from "./infisical.js";

export type SecretScope = "shared" | "personal";

interface CachedSecret {
  value: string;
  scope: SecretScope;
  updatedAt: number;
}

class SecretManager {
  private client: InfisicalClient | null = null;
  private cache = new Map<string, CachedSecret>();
  private refreshIntervalMs = 5 * 60 * 1000; // 5 分
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  /**
   * 初期化: Infisical クライアント生成 → シークレット一括取得
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.client = createInfisicalClient();

    if (this.client) {
      console.log("[secrets] Infisical モードで初期化中...");
      try {
        await this.fetchAll();
        this.startAutoRefresh();
        console.log(
          `[secrets] Infisical から ${this.cache.size} 件のシークレットを取得`
        );
      } catch (err) {
        console.error(
          "[secrets] Infisical からの初回取得に失敗。環境変数フォールバックを併用:",
          err instanceof Error ? err.message : err
        );
      }
    } else {
      console.log(
        "[secrets] 環境変数フォールバックモード (Infisical 未設定)"
      );
    }

    this.initialized = true;
  }

  /**
   * Infisical から全シークレットを取得しキャッシュ更新
   */
  private async fetchAll(): Promise<void> {
    if (!this.client) return;

    // Shared secrets (プロジェクトグローバル)
    const shared = await this.client.getSecrets("/");
    for (const s of shared) {
      this.cache.set(s.secretKey, {
        value: s.secretValue,
        scope: "shared",
        updatedAt: Date.now(),
      });
    }

    // Personal secrets (個人用オーバーライド)
    try {
      const personal = await this.client.getSecrets("/personal");
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
   * シークレットを取得。Infisical キャッシュ → process.env の順で探索。
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
   * Infisical が有効かどうか
   */
  isInfisicalEnabled(): boolean {
    return this.client !== null && this.client.isConfigured();
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
    if (this.client) {
      await this.fetchAll();
    }
  }

  /**
   * Infisical にシークレットを作成/更新
   */
  async setSecret(
    key: string,
    value: string,
    scope: SecretScope = "shared"
  ): Promise<void> {
    if (!this.client) {
      throw new Error("[secrets] Infisical is not configured");
    }

    const path = scope === "personal" ? "/personal" : "/";

    // 更新を試み、失敗 (存在しない) なら作成
    try {
      await this.client.updateSecret(key, value, path, scope);
    } catch {
      await this.client.createSecret(key, value, path, scope);
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
    if (!this.client) {
      throw new Error("[secrets] Infisical is not configured");
    }

    const path = scope === "personal" ? "/personal" : "/";
    await this.client.deleteSecret(key, path, scope);
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
}

// ─── Singleton & Auto-init ──────────────────────────────────

export const secretManager = new SecretManager();

// ESM top-level await で自動初期化
// Infisical 接続失敗時もアプリは起動する (process.env フォールバック)
try {
  await secretManager.init();
} catch (err) {
  console.error(
    "[secrets] 初期化中の予期しないエラー:",
    err instanceof Error ? err.message : err
  );
}
