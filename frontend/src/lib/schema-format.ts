/**
 * Schema Format — データベーススキーマ定義フォーマット
 *
 * 各モジュールが使用するテーブル・カラム・インデックス・制約を
 * 宣言的に記述するための型定義。
 *
 * Drizzle ORM の実装スキーマとは別に、モジュールのDB構造を
 * メタ定義 (設計書) として可視化・管理する目的で使用する。
 */

// ─── Column Types ─────────────────────────────────────────

/** カラムの物理型 (DB方言に依存しない論理型) */
export type ColumnLogicalType =
  | "text"        // 文字列 (VARCHAR / TEXT)
  | "integer"     // 整数
  | "real"        // 浮動小数点
  | "boolean"     // 真偽値 (SQLite では integer 0/1)
  | "timestamp"   // 日時 (Drizzle mode: "timestamp")
  | "date"        // 日付のみ
  | "json"        // JSON (Drizzle mode: "json")
  | "blob";       // バイナリ

/** JSON カラムの内部構造ヒント */
export type JsonShape =
  | "array"            // プリミティブ配列 (例: string[], number[])
  | "object"           // 単一オブジェクト
  | "array-of-objects" // オブジェクト配列
  | "unknown";         // 型不定

// ─── Column Definition ────────────────────────────────────

/** カラム定義 */
export interface ColumnDefinition {
  /** カラム名 */
  name: string;
  /** 論理型 */
  type: ColumnLogicalType;
  /** 主キー */
  primaryKey?: boolean;
  /** NOT NULL 制約 */
  notNull?: boolean;
  /** ユニーク制約 */
  unique?: boolean;
  /** デフォルト値の説明 (例: "UUID v4", "current timestamp", "0") */
  defaultDescription?: string;
  /** JSON カラムの場合の内部構造 */
  jsonShape?: JsonShape;
  /** JSON カラムの場合の要素型説明 (例: "string[]", "{ id, title, status }[]") */
  jsonElementType?: string;
  /** 説明 */
  description?: string;
}

// ─── Foreign Key ──────────────────────────────────────────

/** 外部キー定義 */
export interface ForeignKeyDefinition {
  /** 外部キーカラム名 */
  column: string;
  /** 参照先テーブル名 */
  referencesTable: string;
  /** 参照先カラム名 */
  referencesColumn: string;
  /** 削除時の挙動 */
  onDelete?: "cascade" | "set null" | "restrict" | "no action";
  /** 更新時の挙動 */
  onUpdate?: "cascade" | "set null" | "restrict" | "no action";
}

// ─── Index ────────────────────────────────────────────────

/** インデックス定義 */
export interface IndexDefinition {
  /** インデックス名 */
  name: string;
  /** 対象カラム (複合インデックスの場合は複数) */
  columns: string[];
  /** ユニークインデックスか */
  unique?: boolean;
  /** 説明 (なぜこのインデックスが必要か) */
  description?: string;
}

// ─── Composite Constraint ─────────────────────────────────

/** 複合制約定義 (複合ユニーク、複合主キー等) */
export interface CompositeConstraintDefinition {
  /** 制約名 */
  name: string;
  /** 制約種別 */
  type: "unique" | "primary-key" | "check";
  /** 対象カラム */
  columns: string[];
  /** CHECK 制約の場合の条件式 (自然言語) */
  checkExpression?: string;
}

// ─── Table Definition ─────────────────────────────────────

/** テーブル定義 */
export interface TableDefinition {
  /** テーブル名 (snake_case) */
  name: string;
  /** 説明 */
  description?: string;
  /** 対応するドメインエンティティ名 (domain-format の EntityDefinition.name) */
  domainEntity?: string;
  /** カラム一覧 */
  columns: ColumnDefinition[];
  /** 外部キー一覧 */
  foreignKeys?: ForeignKeyDefinition[];
  /** インデックス一覧 */
  indexes?: IndexDefinition[];
  /** 複合制約一覧 */
  compositeConstraints?: CompositeConstraintDefinition[];
  /** 中間テーブルか (M:N リレーション用) */
  isJunction?: boolean;
}

// ─── Migration Hint ───────────────────────────────────────

/** マイグレーションヒント — スキーマ変更の意図を記録 */
export interface MigrationHint {
  /** 変更対象テーブル */
  table: string;
  /** 変更種別 */
  type: "add-table" | "add-column" | "modify-column" | "drop-column" | "add-index" | "add-fk";
  /** 変更の説明 */
  description: string;
  /** 破壊的変更か */
  breaking?: boolean;
  /** データ移行が必要か */
  requiresDataMigration?: boolean;
}

// ─── Module Schema Format ─────────────────────────────────

/** モジュールのDBスキーマ定義 */
export interface ModuleSchemaFormat {
  /** 対応するモジュールID */
  moduleId: string;
  /** スキーマファイルのパス (参照用, 例: "src/db/schema.ts") */
  schemaFile?: string;
  /** テーブル定義一覧 */
  tables: TableDefinition[];
  /** マイグレーションヒント (将来のスキーマ変更予定) */
  migrationHints?: MigrationHint[];
}
