/**
 * Module Registry — UI モジュール登録システム
 *
 * モジュールがメニュー項目・UIブロック(ウィジェット)・ルートを
 * プラグイン的に登録するための中央レジストリ。
 *
 * 使い方:
 *   import { moduleRegistry } from "./module-registry";
 *   moduleRegistry.registerModule(myModuleDefinition);
 */

import type { ComponentType, ReactNode } from "react";

// ─── Menu Plugin Interface ─────────────────────────────────

/**
 * メニュー最上位カテゴリ
 *
 * Actio は「予定 (Event)」「タスク (Task)」「その他」の 3 軸で
 * モジュールを分類する。各モジュールグループは category を宣言することで
 * サイドバー / ダッシュボードの最上位見出しの下に配置される。
 */
export type MenuCategory = "event" | "task" | "other";

/** カテゴリの表示ラベル */
export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  event: "予定",
  task: "タスク",
  other: "その他機能",
};

/** カテゴリの表示順 */
export const MENU_CATEGORY_ORDER: Record<MenuCategory, number> = {
  event: 0,
  task: 1,
  other: 2,
};

/** ナビゲーションメニュー項目 */
export interface MenuItem {
  /** ルートパス (例: "/calendar") */
  to: string;
  /** 表示ラベル */
  label: string;
  /** アイコン文字 (シンボル1文字) */
  icon?: string;
  /** 管理者のみ表示 */
  adminOnly?: boolean;
  /** サイドバーから非表示切替可能 */
  removable?: boolean;
  /** メニュー内の表示順 (小さい方が上) */
  order?: number;
}

/** メニューグループ (階層メニューのカテゴリ) */
export interface MenuGroup {
  /** 一意なグループID */
  id: string;
  /** 表示ラベル */
  label: string;
  /** アイコン文字 */
  icon?: string;
  /** グループ全体の表示順 */
  order: number;
  /** 管理者のみ表示 */
  adminOnly?: boolean;
  /** グループ内のメニュー項目 */
  items: MenuItem[];
  /** デフォルトで折りたたむか */
  defaultCollapsed?: boolean;
  /**
   * このグループが属する最上位カテゴリ。
   * 指定しない場合は "other" (その他機能) 扱い。
   */
  category?: MenuCategory;
}

// ─── UI Block (Widget) Plugin Interface ────────────────────

/** ダッシュボード等に配置可能なUIブロック */
export interface UIBlock {
  /** 一意なブロックID (例: "calendar-today-schedule") */
  id: string;
  /** ブロックのタイトル */
  title: string;
  /** ブロックの説明 */
  description?: string;
  /** Reactコンポーネント (lazy import 推奨) */
  component: ComponentType<UIBlockProps>;
  /** 配置先のスロットID */
  slot: UIBlockSlot;
  /** 表示順 (小さい方が先) */
  order: number;
  /** 表示するのに必要なロール */
  requiredRole?: "admin" | "group_leader";
  /** デフォルトで表示するか */
  defaultVisible?: boolean;
  /** ブロックの幅ヒント */
  size?: "small" | "medium" | "large" | "full";
}

/** UIブロックに渡される共通Props */
export interface UIBlockProps {
  /** ブロック定義 */
  blockId: string;
  /** ブロックのchildren (カスタムコンテンツ) */
  children?: ReactNode;
}

/** UIブロックの配置先スロット */
export type UIBlockSlot =
  | "dashboard-top"       // ダッシュボード上部
  | "dashboard-main"      // ダッシュボードメイン領域
  | "dashboard-sidebar"   // ダッシュボードサイドバー
  | "dashboard-bottom"    // ダッシュボード下部
  | "page-header"         // ページヘッダー領域
  | "page-footer";        // ページフッター領域

// ─── Route Definition ──────────────────────────────────────

/** モジュールが提供するルート定義 */
export interface ModuleRoute {
  /** パス (例: "/pm/:projectId") */
  path: string;
  /** ページコンポーネント (lazy import 推奨) */
  component: ComponentType;
  /** リダイレクト先 (componentの代わりに使用) */
  redirectTo?: string;
}

// ─── Module Definition ─────────────────────────────────────

/** モジュール定義 — メニュー・ブロック・ルートをまとめて登録 */
export interface ModuleDefinition {
  /** 一意なモジュールID (例: "core", "m1-school", "pm") */
  id: string;
  /** モジュール名 */
  name: string;
  /** 説明 */
  description?: string;
  /** メニューグループ定義 (複数可) */
  menuGroups?: MenuGroup[];
  /** トップレベルメニュー項目 (グループに属さない) */
  menuItems?: MenuItem[];
  /** UIブロック定義 */
  blocks?: UIBlock[];
  /** ルート定義 */
  routes?: ModuleRoute[];
}

// ─── Registry Implementation ───────────────────────────────

class ModuleRegistry {
  private modules: Map<string, ModuleDefinition> = new Map();
  private listeners: Array<() => void> = [];

  /** モジュールを登録 */
  registerModule(definition: ModuleDefinition): void {
    if (this.modules.has(definition.id)) {
      console.warn(`[ModuleRegistry] Module "${definition.id}" is already registered. Overwriting.`);
    }
    this.modules.set(definition.id, definition);
    this.notifyListeners();
  }

  /** モジュール登録を解除 */
  unregisterModule(moduleId: string): void {
    this.modules.delete(moduleId);
    this.notifyListeners();
  }

  /** 登録済み全モジュールを取得 */
  getModules(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  /** 特定モジュールを取得 */
  getModule(moduleId: string): ModuleDefinition | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * 全メニューグループを取得 (order順にソート)
   * 全モジュールのmenuGroupsを統合して返す
   */
  getMenuGroups(): MenuGroup[] {
    const groups: MenuGroup[] = [];
    for (const mod of this.modules.values()) {
      if (mod.menuGroups) {
        groups.push(...mod.menuGroups);
      }
    }
    groups.sort((a, b) => a.order - b.order);
    // 各グループ内もorder順にソート
    for (const g of groups) {
      g.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return groups;
  }

  /**
   * カテゴリ別 (予定 / タスク / その他) にメニューグループを取得
   *
   * 各カテゴリ内ではグループ order → 項目 order でソートされる。
   * category 未指定のグループは "other" 扱い。
   */
  getMenuGroupsByCategory(): Record<MenuCategory, MenuGroup[]> {
    const result: Record<MenuCategory, MenuGroup[]> = {
      event: [],
      task: [],
      other: [],
    };
    for (const g of this.getMenuGroups()) {
      const cat = g.category ?? "other";
      result[cat].push(g);
    }
    return result;
  }

  /**
   * グループに属さないトップレベルメニュー項目を取得
   */
  getTopLevelMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];
    for (const mod of this.modules.values()) {
      if (mod.menuItems) {
        items.push(...mod.menuItems);
      }
    }
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return items;
  }

  /**
   * 指定スロットのUIブロックを取得 (order順)
   */
  getBlocks(slot: UIBlockSlot): UIBlock[] {
    const blocks: UIBlock[] = [];
    for (const mod of this.modules.values()) {
      if (mod.blocks) {
        blocks.push(...mod.blocks.filter((b) => b.slot === slot));
      }
    }
    blocks.sort((a, b) => a.order - b.order);
    return blocks;
  }

  /**
   * 全UIブロックを取得
   */
  getAllBlocks(): UIBlock[] {
    const blocks: UIBlock[] = [];
    for (const mod of this.modules.values()) {
      if (mod.blocks) {
        blocks.push(...mod.blocks);
      }
    }
    blocks.sort((a, b) => a.order - b.order);
    return blocks;
  }

  /**
   * 全ルートを取得
   */
  getRoutes(): ModuleRoute[] {
    const routes: ModuleRoute[] = [];
    for (const mod of this.modules.values()) {
      if (mod.routes) {
        routes.push(...mod.routes);
      }
    }
    return routes;
  }

  /** 変更通知リスナーを登録 */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** グローバルモジュールレジストリ (シングルトン) */
export const moduleRegistry = new ModuleRegistry();
