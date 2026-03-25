/**
 * AWS SSM Parameter Store クライアント
 *
 * SSM Parameter Store からシークレットを取得する。
 * パスプレフィックス配下のパラメータを一括取得し、キャッシュする。
 *
 * Bootstrap 用環境変数 (process.env から読む):
 *   SSM_PATH_PREFIX   — パラメータのパスプレフィックス (例: /schedula/prod/)
 *   AWS_REGION        — AWS リージョン (デフォルト: ap-northeast-1)
 *   AWS_ACCESS_KEY_ID — (任意) 明示的な認証情報。未設定なら IAM ロール等を使用
 *   AWS_SECRET_ACCESS_KEY — (任意) 上記とペア
 */

import {
  SSMClient,
  GetParametersByPathCommand,
  type Parameter,
} from "@aws-sdk/client-ssm";

// ─── Types ──────────────────────────────────────────────────

export interface SsmConfig {
  region: string;
  pathPrefix: string;
}

// ─── Client ─────────────────────────────────────────────────

export class SsmParameterStoreClient {
  private client: SSMClient;
  private pathPrefix: string;

  constructor(config: SsmConfig) {
    this.client = new SSMClient({ region: config.region });
    // パスプレフィックスが "/" で終わるように正規化
    this.pathPrefix = config.pathPrefix.endsWith("/")
      ? config.pathPrefix
      : config.pathPrefix + "/";
  }

  /**
   * パスプレフィックス配下の全パラメータを取得
   * パラメータ名からプレフィックスを除去してキーとする
   * 例: /schedula/prod/JWT_SECRET → JWT_SECRET
   */
  async getParameters(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    let nextToken: string | undefined;

    do {
      const command = new GetParametersByPathCommand({
        Path: this.pathPrefix,
        Recursive: true,
        WithDecryption: true,
        MaxResults: 10,
        NextToken: nextToken,
      });

      const response = await this.client.send(command);
      const parameters: Parameter[] = response.Parameters ?? [];

      for (const param of parameters) {
        if (param.Name && param.Value !== undefined) {
          // プレフィックスを除去してキー名にする
          // /schedula/prod/JWT_SECRET → JWT_SECRET
          // /schedula/prod/db/DATABASE_URL → db/DATABASE_URL (サブパスは保持)
          const key = param.Name.startsWith(this.pathPrefix)
            ? param.Name.slice(this.pathPrefix.length)
            : param.Name;
          // スラッシュを含むサブパスはアンダースコアに変換
          // db/DATABASE_URL → DATABASE_URL (最後のセグメントのみ使用)
          const normalizedKey = key.includes("/")
            ? key.split("/").pop() ?? key
            : key;
          result.set(normalizedKey, param.Value);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return result;
  }

  /**
   * 接続テスト: パスプレフィックス配下のパラメータ数を返す
   */
  async testConnection(): Promise<number> {
    const params = await this.getParameters();
    return params.size;
  }

  isConfigured(): boolean {
    return !!this.pathPrefix;
  }
}

// ─── Factory ────────────────────────────────────────────────

/**
 * 環境変数から SSM クライアントを生成。
 * SSM_PATH_PREFIX が未設定なら null を返す (= SSM 無効)。
 */
export function createSsmClient(): SsmParameterStoreClient | null {
  const pathPrefix = process.env.SSM_PATH_PREFIX;
  const region = process.env.AWS_REGION || "ap-northeast-1";

  if (!pathPrefix) return null;

  return new SsmParameterStoreClient({ region, pathPrefix });
}
