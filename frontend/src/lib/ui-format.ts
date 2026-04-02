/**
 * Module UI Format — モジュールページのUI表現フォーマット定義
 *
 * 各モジュールのページがどのようなレイアウト・サイズ・構成で
 * 描画されるかを宣言的に記述するための型定義。
 *
 * ModuleDefinition と組み合わせて使用し、ページの見た目を統一的に管理する。
 */

// ─── Page Size ────────────────────────────────────────────

/** ページ幅の挙動 */
export type PageWidthMode =
  | "fluid"       // 親コンテナいっぱいに広がる (デフォルト)
  | "constrained" // maxWidth で上限を設ける
  | "fixed";      // 固定幅 (スクロール可)

/** ページ高さの挙動 */
export type PageHeightMode =
  | "auto"        // コンテンツに合わせて伸縮 (デフォルト)
  | "viewport"    // ビューポート全体を使う (カレンダー等)
  | "fixed";      // 固定高さ

/** ページサイズ設定 */
export interface PageSize {
  /** 幅の挙動 */
  width: PageWidthMode;
  /** maxWidth (px) — width が "constrained" のとき有効 */
  maxWidth?: number;
  /** minWidth (px) — 最低保証幅 */
  minWidth?: number;
  /** 高さの挙動 */
  height: PageHeightMode;
  /** 固定高さ (px) — height が "fixed" のとき有効 */
  fixedHeight?: number;
  /** ユーザーがリサイズ可能か */
  resizable?: boolean;
}

// ─── Layout ───────────────────────────────────────────────

/** レイアウトパターン */
export type LayoutType =
  | "single-column" // 1カラム (フォーム、設定画面等)
  | "two-column"    // メイン + サイドバー
  | "grid"          // カード等をグリッド配置
  | "tabs"          // タブ切替で複数ビュー
  | "split";        // 左右/上下分割 (リスト+詳細等)

/** レイアウト定義 */
export interface LayoutDefinition {
  /** レイアウトパターン */
  type: LayoutType;
  /** タブ定義 — type が "tabs" のとき必須 */
  tabs?: TabDefinition[];
  /** 分割方向 — type が "split" のとき有効 */
  splitDirection?: "horizontal" | "vertical";
  /** メイン領域とサブ領域の比率 — type が "two-column" / "split" のとき (例: [3, 1]) */
  ratio?: [number, number];
  /** グリッドの列数 — type が "grid" のとき有効 */
  columns?: number | "auto-fill";
  /** レイアウト内のブロック配置 */
  blocks: LayoutBlock[];
}

/** タブ定義 */
export interface TabDefinition {
  /** タブID */
  id: string;
  /** タブラベル */
  label: string;
  /** タブ内のブロック配置 */
  blocks: LayoutBlock[];
}

// ─── Layout Block ─────────────────────────────────────────

/** ブロックのコンテンツ種別 */
export type BlockContentType =
  | "table"       // データテーブル (一覧表示)
  | "form"        // 入力フォーム
  | "card-grid"   // カードのグリッド表示
  | "calendar"    // カレンダービュー
  | "timetable"   // 時間割グリッド
  | "chart"       // グラフ・チャート
  | "stat"        // 統計サマリー (KPIカード等)
  | "list"        // シンプルなリスト
  | "detail"      // 詳細表示パネル
  | "empty-state" // データなし時の案内表示
  | "custom";     // 上記に該当しない自由形式

/** ブロックサイズヒント */
export type BlockSize = "small" | "medium" | "large" | "full";

/** レイアウトブロック — ページ内の1セクション */
export interface LayoutBlock {
  /** ブロックID (ページ内でユニーク) */
  id: string;
  /** ブロックタイトル (表示用、省略可) */
  title?: string;
  /** コンテンツ種別 */
  contentType: BlockContentType;
  /** ブロックサイズヒント */
  size?: BlockSize;
  /** グリッド配置時の列スパン */
  colSpan?: number;
  /** グリッド配置時の行スパン */
  rowSpan?: number;
  /** 配置先 — two-column / split のとき */
  area?: "main" | "side" | "header" | "footer";
  /** ブロック単体でリサイズ可能か */
  resizable?: boolean;
  /** 折りたたみ可能か */
  collapsible?: boolean;
  /** デフォルトで折りたたんだ状態か */
  defaultCollapsed?: boolean;
}

// ─── Density ──────────────────────────────────────────────

/** 表示密度 */
export type Density = "compact" | "normal" | "comfortable";

// ─── Responsive ───────────────────────────────────────────

/** ブレークポイント名 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

/** レスポンシブオーバーライド */
export interface ResponsiveOverride {
  /** 適用対象ブレークポイント */
  breakpoint: Breakpoint;
  /** レイアウトの上書き (例: two-column → single-column) */
  layout?: Partial<LayoutDefinition>;
  /** 非表示にするブロックID */
  hiddenBlocks?: string[];
  /** 密度の上書き */
  density?: Density;
}

// ─── Page UI Format ───────────────────────────────────────

/** ページ単位のUIフォーマット定義 */
export interface PageUIFormat {
  /** 対応するルートパス (例: "/calendar", "/pm/:projectId") */
  path: string;
  /** ページサイズ設定 */
  size: PageSize;
  /** レイアウト定義 */
  layout: LayoutDefinition;
  /** 表示密度 */
  density?: Density;
  /** レスポンシブオーバーライド */
  responsive?: ResponsiveOverride[];
}

// ─── Module UI Format ─────────────────────────────────────

/** モジュール単位のUIフォーマット定義 */
export interface ModuleUIFormat {
  /** 対応する ModuleDefinition.id */
  moduleId: string;
  /** モジュール内の各ページのUIフォーマット */
  pages: PageUIFormat[];
}
