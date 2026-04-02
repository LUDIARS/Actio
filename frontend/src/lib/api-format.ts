/**
 * API Format — モジュールのAPIコントラクト定義フォーマット
 *
 * 各モジュールが公開するHTTPエンドポイントのリクエスト・レスポンス仕様を
 * 宣言的に記述するための型定義。
 */

// ─── HTTP ─────────────────────────────────────────────────

/** HTTP メソッド */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** APIパラメータの送信場所 */
export type ParamLocation = "path" | "query" | "body" | "header";

// ─── Parameter & Response ─────────────────────────────────

/** APIパラメータ定義 */
export interface ApiParamDefinition {
  /** パラメータ名 */
  name: string;
  /** 送信場所 */
  in: ParamLocation;
  /** 型 (例: "string", "number", "boolean", "object") */
  type: string;
  /** 必須か */
  required?: boolean;
  /** 説明 */
  description?: string;
}

/** レスポンス定義 */
export interface ApiResponseDefinition {
  /** HTTPステータスコード */
  status: number;
  /** レスポンスの型 (エンティティ名や自由記述) */
  type?: string;
  /** 配列レスポンスか */
  array?: boolean;
  /** 説明 */
  description?: string;
}

// ─── Endpoint ─────────────────────────────────────────────

/** APIエンドポイント定義 */
export interface ApiEndpointDefinition {
  /** HTTPメソッド */
  method: HttpMethod;
  /** パス (例: "/api/pm/projects/:projectId/tasks") */
  path: string;
  /** 説明 */
  description?: string;
  /** パラメータ */
  params?: ApiParamDefinition[];
  /** レスポンス定義 */
  responses?: ApiResponseDefinition[];
  /** 認証必須か (デフォルト: true) */
  authRequired?: boolean;
  /** 必要な権限ロール */
  requiredRole?: "admin" | "group_leader";
  /** 対応するドメイン操作名 (domain-format の OperationDefinition.name) */
  domainOperation?: string;
}

// ─── Module API Format ────────────────────────────────────

/** モジュールのAPIコントラクト定義 */
export interface ModuleApiFormat {
  /** 対応するモジュールID */
  moduleId: string;
  /** ベースパス (例: "/api/pm") */
  basePath: string;
  /** エンドポイント一覧 */
  endpoints: ApiEndpointDefinition[];
}
