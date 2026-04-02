/**
 * Module Manifest — モジュール設計書の統括定義
 *
 * UI表現・ドメインモデル・DBスキーマ・APIコントラクトの4種の
 * フォーマット定義を束ね、モジュール間の依存関係を管理する。
 *
 * 各モジュールは1つの ModuleManifest を持ち、
 * 設計レベルでの全体像を宣言的に表現する。
 */

import type { ModuleUIFormat } from "./ui-format";
import type { ModuleDomainFormat } from "./domain-format";
import type { ModuleSchemaFormat } from "./schema-format";

// ─── API Contract ─────────────────────────────────────────

/** HTTP メソッド */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** APIパラメータの送信場所 */
export type ParamLocation = "path" | "query" | "body" | "header";

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

/** モジュールのAPIコントラクト定義 */
export interface ModuleApiFormat {
  /** 対応するモジュールID */
  moduleId: string;
  /** ベースパス (例: "/api/pm") */
  basePath: string;
  /** エンドポイント一覧 */
  endpoints: ApiEndpointDefinition[];
}

// ─── Dependencies ─────────────────────────────────────────

/** 依存の種別 */
export type DependencyType =
  | "required"   // 必須依存 (相手がないと動作不可)
  | "optional"   // オプション依存 (相手があれば連携)
  | "event";     // イベント経由の疎結合依存

/** モジュール間の依存定義 */
export interface ModuleDependency {
  /** 依存先モジュールID */
  moduleId: string;
  /** 依存の種別 */
  type: DependencyType;
  /** 依存の説明 (何のために必要か) */
  reason: string;
  /** 利用するエンティティ名 (相手モジュールの) */
  usesEntities?: string[];
  /** 購読するイベント名 (event 依存の場合) */
  subscribesTo?: string[];
  /** 呼び出すAPI (相手モジュールの) */
  usesEndpoints?: string[];
}

/** 他モジュールに公開するインターフェース */
export interface ExportedInterface {
  /** 公開名 */
  name: string;
  /** 種別 */
  type: "entity" | "event" | "operation" | "plugin";
  /** 説明 */
  description?: string;
}

// ─── Module Manifest ──────────────────────────────────────

/** モジュール設計書 — 全フォーマットを統括する最上位定義 */
export interface ModuleManifest {
  /** モジュールID (ModuleDefinition.id と一致) */
  moduleId: string;
  /** モジュール名 */
  name: string;
  /** 説明 */
  description?: string;
  /** バージョン (設計書のバージョン管理用) */
  version?: string;

  // ── 4種のフォーマット定義 ──

  /** UI表現フォーマット (メニュー階層 + ページレイアウト) */
  ui?: ModuleUIFormat;
  /** ドメインモデルフォーマット (エンティティ・ルール・イベント) */
  domain?: ModuleDomainFormat;
  /** DBスキーマフォーマット (テーブル・カラム・制約) */
  schema?: ModuleSchemaFormat;
  /** APIコントラクトフォーマット (エンドポイント・パラメータ) */
  api?: ModuleApiFormat;

  // ── 依存関係 ──

  /** 他モジュールへの依存 */
  dependencies?: ModuleDependency[];
  /** 他モジュールに公開するインターフェース */
  exports?: ExportedInterface[];
}
