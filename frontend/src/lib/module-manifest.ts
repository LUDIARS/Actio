/**
 * Module Manifest — モジュール設計書の統括型定義
 *
 * Markdown テンプレート (docs/module-manifest.template.md) 内の
 * YAML フロントマター / コードブロックをパースした結果の TypeScript 型。
 *
 * 設計書は Markdown で人が読み書きし、構造化データ部分は YAML で記述、
 * この型定義でバリデーション・型安全なアクセスを提供する。
 */

import type { ModuleUIFormat } from "./ui-format";
import type { ModuleDomainFormat } from "./domain-format";
import type { ModuleSchemaFormat } from "./schema-format";
import type { ModuleApiFormat } from "./api-format";

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

  // ── 5種のフォーマット定義 ──

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
