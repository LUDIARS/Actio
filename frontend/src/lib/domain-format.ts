/**
 * Domain Format — モジュールのドメインモデル定義フォーマット
 *
 * 各モジュールが扱うエンティティ・値オブジェクト・ビジネスルール・
 * 状態遷移・ドメインイベントを宣言的に記述するための型定義。
 *
 * 実装コードではなく「このモジュールのドメインはこう構成される」という
 * メタ定義 (設計書) として使用する。
 */

// ─── Field & Value Object ─────────────────────────────────

/** フィールドのプリミティブ型 */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "enum"
  | "json"
  | "array";

/** フィールド定義 */
export interface FieldDefinition {
  /** フィールド名 */
  name: string;
  /** 型 */
  type: FieldType;
  /** 配列・enum の要素型 (type が "array" or "enum" のとき) */
  itemType?: string;
  /** null 許容 */
  nullable?: boolean;
  /** デフォルト値の有無 (値そのものではなく有無のみ) */
  hasDefault?: boolean;
  /** 説明 */
  description?: string;
  /** バリデーションルール */
  validation?: ValidationRule[];
}

/** バリデーションルール */
export interface ValidationRule {
  /** ルール種別 */
  type: ValidationRuleType;
  /** パラメータ (min/max の値、pattern の正規表現等) */
  param?: string | number;
  /** エラーメッセージ */
  message?: string;
  /** 厳格度 — error は必須、warning は推奨 */
  severity?: "error" | "warning";
}

/** バリデーションルール種別 */
export type ValidationRuleType =
  | "required"
  | "min"          // 数値の最小値 or 文字列の最小長
  | "max"          // 数値の最大値 or 文字列の最大長
  | "pattern"      // 正規表現
  | "enum"         // 許容値リスト
  | "unique"       // ユニーク制約
  | "custom";      // カスタムバリデーション (名前で参照)

// ─── Entity & Aggregate ───────────────────────────────────

/** エンティティの識別子戦略 */
export type IdentityStrategy = "uuid" | "auto-increment" | "natural" | "composite";

/** エンティティ定義 — 一意な識別子を持つドメインオブジェクト */
export interface EntityDefinition {
  /** エンティティ名 (PascalCase, 例: "Curriculum") */
  name: string;
  /** 説明 */
  description?: string;
  /** 識別子フィールド名 (デフォルト: "id") */
  identityField?: string;
  /** 識別子の生成戦略 */
  identityStrategy?: IdentityStrategy;
  /** フィールド一覧 */
  fields: FieldDefinition[];
  /** 不変条件 (ビジネスルール) */
  invariants?: InvariantDefinition[];
}

/** 集約ルート定義 — トランザクション境界を持つエンティティ群 */
export interface AggregateDefinition {
  /** 集約ルートのエンティティ名 */
  root: string;
  /** 集約に含まれる子エンティティ名 */
  children?: string[];
  /** 集約の説明 */
  description?: string;
}

/** 値オブジェクト定義 — 識別子を持たない不変のオブジェクト */
export interface ValueObjectDefinition {
  /** 値オブジェクト名 (例: "Period", "DateRange") */
  name: string;
  /** 説明 */
  description?: string;
  /** フィールド一覧 */
  fields: FieldDefinition[];
}

// ─── Relationships ────────────────────────────────────────

/** リレーションの多重度 */
export type Cardinality = "1:1" | "1:N" | "N:1" | "M:N";

/** エンティティ間のリレーション定義 */
export interface RelationshipDefinition {
  /** リレーション名 (例: "department-curricula") */
  name: string;
  /** 参照元エンティティ */
  from: string;
  /** 参照先エンティティ */
  to: string;
  /** 多重度 */
  cardinality: Cardinality;
  /** 中間テーブル名 (M:N の場合) */
  junctionEntity?: string;
  /** 参照元の外部キーフィールド名 */
  foreignKey?: string;
  /** 削除時の挙動 */
  onDelete?: "cascade" | "set-null" | "restrict" | "no-action";
  /** 必須リレーションか (null 不可) */
  required?: boolean;
  /** 説明 */
  description?: string;
}

// ─── Invariants & Business Rules ──────────────────────────

/** 不変条件 (ビジネスルール) */
export interface InvariantDefinition {
  /** ルールID */
  id: string;
  /** ルールの説明 (自然言語) */
  description: string;
  /** 関連するフィールド名 */
  fields?: string[];
  /** 厳格度 */
  severity: "error" | "warning";
}

// ─── State Machine ────────────────────────────────────────

/** 状態遷移定義 */
export interface StateTransition {
  /** 遷移元の状態 */
  from: string;
  /** 遷移先の状態 */
  to: string;
  /** 遷移トリガー (アクション名) */
  trigger: string;
  /** 遷移の前提条件 (自然言語) */
  guard?: string;
}

/** ステートマシン定義 — エンティティのライフサイクル */
export interface StateMachineDefinition {
  /** 対象エンティティ名 */
  entity: string;
  /** 状態を保持するフィールド名 */
  field: string;
  /** 取りうる状態の一覧 */
  states: string[];
  /** 初期状態 */
  initial: string;
  /** 終了状態 (これ以上遷移しない) */
  terminal?: string[];
  /** 遷移定義 */
  transitions: StateTransition[];
}

// ─── Domain Events ────────────────────────────────────────

/** ドメインイベント定義 */
export interface DomainEventDefinition {
  /** イベント名 (ドット区切り, 例: "pm.task.created") */
  name: string;
  /** 説明 */
  description?: string;
  /** ペイロードのフィールド */
  payload: FieldDefinition[];
  /** 発行元エンティティ */
  source: string;
}

// ─── Operations ───────────────────────────────────────────

/** 操作の種別 */
export type OperationType = "command" | "query";

/** ドメイン操作定義 (コマンド or クエリ) */
export interface OperationDefinition {
  /** 操作名 (例: "createCurriculum", "findByDepartment") */
  name: string;
  /** コマンド (副作用あり) or クエリ (読み取りのみ) */
  type: OperationType;
  /** 説明 */
  description?: string;
  /** 入力パラメータ */
  input?: FieldDefinition[];
  /** 出力の型 (エンティティ名 or 値オブジェクト名) */
  output?: string;
  /** 出力が配列か */
  outputArray?: boolean;
  /** 必要な権限ロール */
  requiredRole?: "admin" | "group_leader";
  /** 発行するイベント名 */
  emitsEvents?: string[];
}

// ─── Module Domain Format ─────────────────────────────────

/** モジュールのドメインモデル定義 */
export interface ModuleDomainFormat {
  /** 対応するモジュールID */
  moduleId: string;
  /** エンティティ定義 */
  entities: EntityDefinition[];
  /** 値オブジェクト定義 */
  valueObjects?: ValueObjectDefinition[];
  /** 集約定義 */
  aggregates?: AggregateDefinition[];
  /** リレーション定義 */
  relationships?: RelationshipDefinition[];
  /** ステートマシン定義 */
  stateMachines?: StateMachineDefinition[];
  /** ドメインイベント定義 */
  events?: DomainEventDefinition[];
  /** 操作定義 (コマンド・クエリ) */
  operations?: OperationDefinition[];
}
