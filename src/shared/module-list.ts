/**
 * Module List Format Definition — モジュール一覧フォーマット定義
 *
 * Actio の全モジュールを統一フォーマットで定義する。
 * バックエンド (API 情報エンドポイント) とフロントエンド (モジュール管理UI) の
 * 両方から参照可能な Single Source of Truth。
 *
 * 新モジュール追加時はこのファイルの MODULE_LIST に追記すること。
 */

// ─── Format Definition (型定義) ───────────────────────────────

/** モジュールのカテゴリ */
export type ModuleCategory =
  | "core"          // コア機能 (認証, プロフィール, グループ等)
  | "schedule"      // スケジュール関連 (カレンダー, マイプラン, スマートスケジューラ)
  | "school"        // 学校管理 (M1: カリキュラム, 施設予約)
  | "project"       // プロジェクト管理 (M2: PM)
  | "automation"    // 自動化 (M3: MACHINA)
  | "reservation"   // 予約 (施設予約, 日程調整)
  | "integration"   // 外部連携 (Google Calendar, Notion, API)
  | "notification"  // 通知 (Webhook)
  | "admin";        // 管理者機能 (設定, ログ, DB, シークレット)

/** モジュールのステータス */
export type ModuleStatus =
  | "active"        // 稼働中
  | "legacy"        // レガシー (後方互換のため残存)
  | "experimental"; // 実験的

/** サブモジュール定義 */
export interface SubModuleEntry {
  /** サブモジュール識別子 */
  id: string;
  /** 表示名 */
  name: string;
  /** APIサブパス (親モジュールの basePath からの相対パス) */
  apiSubPath: string;
  /** フロントエンドパス */
  frontendPath?: string;
}

/** モジュール一覧エントリ — 1モジュールの完全な情報 */
export interface ModuleListEntry {
  /** 一意なモジュール識別子 (例: "calendar", "m1-school", "m2-pm") */
  id: string;
  /** 表示名 */
  name: string;
  /** モジュールの説明 */
  description: string;
  /** カテゴリ */
  category: ModuleCategory;
  /** ステータス */
  status: ModuleStatus;

  // ─── Backend ────────────────────────────────────────────
  /** バックエンドのソースディレクトリ (リポジトリルートからの相対パス) */
  backendDir: string;
  /** APIベースパス (例: "/api/calendar") */
  apiBasePath: string;

  // ─── Frontend ───────────────────────────────────────────
  /** フロントエンドページコンポーネント (複数可) */
  frontendPages?: string[];
  /** フロントエンドのルートパス (複数可) */
  frontendPaths?: string[];
  /** フロントエンドモジュール定義ファイル */
  frontendModuleFile?: string;

  // ─── Access ─────────────────────────────────────────────
  /** 管理者専用か */
  adminOnly?: boolean;
  /** 認証不要か */
  noAuth?: boolean;

  // ─── Structure ──────────────────────────────────────────
  /** サブモジュール (ある場合) */
  submodules?: SubModuleEntry[];
  /** 依存するモジュールID */
  dependsOn?: string[];
}

// ─── Module List (実データ) ───────────────────────────────────

export const MODULE_LIST: readonly ModuleListEntry[] = [
  // ━━━ Core ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "auth",
    name: "認証",
    description: "ユーザー認証・セッション管理",
    category: "core",
    status: "active",
    backendDir: "src/auth",
    apiBasePath: "/api/auth",
    frontendPages: ["LoginPage.tsx"],
    frontendPaths: ["/login"],
  },
  {
    id: "profile",
    name: "プロフィール",
    description: "ユーザープロフィール・プロジェクトロール管理",
    category: "core",
    status: "active",
    backendDir: "modules/profile",
    apiBasePath: "/api/profile",
    frontendPages: ["ProfilePage.tsx"],
    frontendPaths: ["/profile"],
    frontendModuleFile: "frontend/src/lib/modules/core.ts",
  },
  {
    id: "group",
    name: "グループ",
    description: "グループ管理・メンバー管理・グループスケジュール・個別予定",
    category: "core",
    status: "active",
    backendDir: "modules/group",
    apiBasePath: "/api/groups",
    frontendPages: ["GroupsPage.tsx"],
    frontendPaths: ["/groups"],
    frontendModuleFile: "frontend/src/lib/modules/group.ts",
    dependsOn: ["holiday"],
  },

  // ━━━ Schedule ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "calendar",
    name: "カレンダー",
    description: "Google Calendar連携 + 手動予定管理",
    category: "schedule",
    status: "active",
    backendDir: "modules/calendar",
    apiBasePath: "/api/calendar",
    frontendPages: ["CalendarPage.tsx"],
    frontendPaths: ["/calendar"],
    frontendModuleFile: "frontend/src/lib/modules/schedule.ts",
    dependsOn: ["integration"],
  },
  {
    id: "myplan",
    name: "マイプラン",
    description: "週間ルーティーン (時間割ベースのプラン管理)",
    category: "schedule",
    status: "active",
    backendDir: "modules/myplan",
    apiBasePath: "/api/myplans",
    frontendPages: ["MyPlanPage.tsx"],
    frontendPaths: ["/my-plan"],
    frontendModuleFile: "frontend/src/lib/modules/schedule.ts",
  },
  {
    id: "smart-scheduler",
    name: "スマートスケジューラ",
    description: "制約ベース自動配置スケジューラ (DP ソルバー)",
    category: "schedule",
    status: "active",
    backendDir: "modules/smart-scheduler",
    apiBasePath: "/api/smart-scheduler",
    frontendPages: ["SmartSchedulerPage.tsx"],
    frontendPaths: ["/scheduler"],
    frontendModuleFile: "frontend/src/lib/modules/schedule.ts",
    dependsOn: ["holiday", "myplan", "group"],
  },
  // reminder モジュールは削除 (Nuntius に移行予定)

  // ━━━ School (M1) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "m1-school",
    name: "M1 学校管理 (CALICULA)",
    description: "学科・講師・カリキュラム CRUD + マイグレーション + 施設予約",
    category: "school",
    status: "active",
    backendDir: "modules/school",
    apiBasePath: "/api/school",
    frontendPages: ["SchemaManagementPage.tsx", "DataManagementPage.tsx", "FacilityBookingPage.tsx"],
    frontendPaths: ["/schema-management", "/data-management", "/reservations/facility"],
    frontendModuleFile: "frontend/src/lib/modules/m1-school.ts",
    adminOnly: true,
    submodules: [
      { id: "m1", name: "カリキュラム管理", apiSubPath: "/m1", frontendPath: "/schema-management" },
      { id: "facility-booking", name: "施設予約", apiSubPath: "/facility-booking", frontendPath: "/reservations/facility" },
    ],
  },
  {
    id: "m1-schedule-legacy",
    name: "M1 スケジュール (レガシー)",
    description: "旧M1スケジュールルート (後方互換)",
    category: "school",
    status: "legacy",
    backendDir: "modules/schedule",
    apiBasePath: "/api/m1",
    frontendPages: ["SchedulePage.tsx", "CurriculumPlanPage.tsx"],
    frontendPaths: ["/schedule", "/curriculum-plan"],
    frontendModuleFile: "frontend/src/lib/modules/schedule.ts",
  },

  // ━━━ Project Management (M2) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "m2-pm",
    name: "M2 PM",
    description: "GitHub/Notion タスク同期・差分検知・分析・プロジェクト管理",
    category: "project",
    status: "active",
    backendDir: "modules/pm",
    apiBasePath: "/api/pm",
    frontendPages: ["PMDashboardPage.tsx", "PMProjectPage.tsx", "PMAnalyticsPage.tsx"],
    frontendPaths: ["/pm", "/pm/:projectId", "/pm/:projectId/analytics"],
    frontendModuleFile: "frontend/src/lib/modules/pm.ts",
    submodules: [
      { id: "projects", name: "プロジェクト管理", apiSubPath: "/projects", frontendPath: "/pm" },
      { id: "tasks", name: "タスク管理", apiSubPath: "/tasks" },
      { id: "analytics", name: "分析・レポート", apiSubPath: "/analytics", frontendPath: "/pm/:projectId/analytics" },
    ],
    dependsOn: ["m3-machina"],
  },

  // ━━━ Automation (M3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "m3-machina",
    name: "M3 MACHINA",
    description: "Slack/Discord チャンネル監視 & ルールベースタスク自動生成",
    category: "automation",
    status: "active",
    backendDir: "modules/machina",
    apiBasePath: "/api/machina",
    frontendPages: ["MachinaPage.tsx"],
    frontendPaths: ["/machina"],
    frontendModuleFile: "frontend/src/lib/modules/machina.ts",
    dependsOn: ["m2-pm"],
  },

  // ━━━ Reservation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "reservation",
    name: "予約管理",
    description: "予約プラグインランチャー (施設予約・日程調整の統合UI)",
    category: "reservation",
    status: "active",
    backendDir: "src/reservation-plugins.ts",
    apiBasePath: "/api/reservations",
    frontendPages: ["ReservationsPage.tsx"],
    frontendPaths: ["/reservations"],
    frontendModuleFile: "frontend/src/lib/modules/reservation.ts",
  },
  {
    id: "voting",
    name: "日程調整 Voting",
    description: "投票ベースの日程調整 (M6)",
    category: "reservation",
    status: "active",
    backendDir: "modules/voting",
    apiBasePath: "/api/voting",
    frontendPages: ["VotingPage.tsx"],
    frontendPaths: ["/voting"],
    frontendModuleFile: "frontend/src/lib/modules/reservation.ts",
  },

  // ━━━ Notification ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "notification",
    name: "通知 (M5)",
    description: "Webhook 通知 (Slack, Discord, Email, Telegram) のマルチチャンネル配信",
    category: "notification",
    status: "active",
    backendDir: "modules/notification",
    apiBasePath: "/api/webhooks",
    frontendPages: ["NotificationsPage.tsx"],
    frontendPaths: ["/notifications"],
    frontendModuleFile: "frontend/src/lib/modules/notification.ts",
  },

  // ━━━ Integration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "integration",
    name: "外部連携",
    description: "Google Calendar・Notion 同期連携",
    category: "integration",
    status: "active",
    backendDir: "modules/integrations",
    apiBasePath: "/api/integrations",
    frontendPages: ["IntegrationsPage.tsx"],
    frontendPaths: ["/integrations"],
    frontendModuleFile: "frontend/src/lib/modules/integration.ts",
  },
  {
    id: "external-api",
    name: "外部API",
    description: "APIキー認証による外部クライアント向け公開API",
    category: "integration",
    status: "active",
    backendDir: "modules/external-api",
    apiBasePath: "/api/external",
    frontendPages: ["ApiKeysPage.tsx"],
    frontendPaths: ["/api-keys"],
    frontendModuleFile: "frontend/src/lib/modules/integration.ts",
  },
  {
    id: "holiday",
    name: "休日管理",
    description: "日本の祝日自動計算・グループ固有休日・休業期間管理",
    category: "integration",
    status: "active",
    backendDir: "modules/holiday",
    apiBasePath: "/api/holidays",
  },

  // ━━━ Admin ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "admin-users",
    name: "ユーザー管理",
    description: "ユーザーの一覧・ロール管理",
    category: "admin",
    status: "active",
    backendDir: "src/auth",
    apiBasePath: "/api/auth",
    frontendPages: ["UserManagementPage.tsx"],
    frontendPaths: ["/admin/users"],
    frontendModuleFile: "frontend/src/lib/modules/admin.ts",
  },
  {
    id: "admin-settings",
    name: "設定",
    description: "アプリケーション設定 (Key-Value ストア)",
    category: "admin",
    status: "active",
    backendDir: "modules/settings",
    apiBasePath: "/api/settings",
    frontendPages: ["SettingsPage.tsx"],
    frontendPaths: ["/admin/settings"],
    frontendModuleFile: "frontend/src/lib/modules/admin.ts",
    adminOnly: true,
  },
  {
    id: "admin-secrets",
    name: "シークレット",
    description: "Infisical/AWS SSM シークレット管理",
    category: "admin",
    status: "active",
    backendDir: "modules/secrets",
    apiBasePath: "/api/secrets",
    frontendPages: ["SecretsPage.tsx", "InfisicalSetupPage.tsx"],
    frontendPaths: ["/admin/secrets"],
    frontendModuleFile: "frontend/src/lib/modules/admin.ts",
    adminOnly: true,
  },
  {
    id: "admin-logs",
    name: "操作ログ",
    description: "アクティビティログの閲覧",
    category: "admin",
    status: "active",
    backendDir: "src/activity-logger.ts",
    apiBasePath: "/api/admin/activity-logs",
    frontendPages: ["ActivityLogsPage.tsx"],
    frontendPaths: ["/admin/activity-logs"],
    frontendModuleFile: "frontend/src/lib/modules/admin.ts",
    adminOnly: true,
  },
  {
    id: "admin-db",
    name: "DB Viewer",
    description: "データベーステーブルの閲覧・検索",
    category: "admin",
    status: "active",
    backendDir: "src/admin/db-viewer.ts",
    apiBasePath: "/api/admin/db",
    frontendPages: ["DbViewerPage.tsx"],
    frontendPaths: ["/admin/db"],
    frontendModuleFile: "frontend/src/lib/modules/admin.ts",
    adminOnly: true,
  },
  {
    id: "setup",
    name: "初回セットアップ",
    description: "初回セットアップウィザード",
    category: "admin",
    status: "active",
    backendDir: "modules/setup",
    apiBasePath: "/api/setup",
    noAuth: true,
  },
];

// ─── Utility Functions ────────────────────────────────────────

/** カテゴリでモジュールを絞り込む */
export function getModulesByCategory(category: ModuleCategory): readonly ModuleListEntry[] {
  return MODULE_LIST.filter((m) => m.category === category);
}

/** アクティブなモジュールのみ取得 */
export function getActiveModules(): readonly ModuleListEntry[] {
  return MODULE_LIST.filter((m) => m.status === "active");
}

/** モジュールIDで検索 */
export function findModuleById(id: string): ModuleListEntry | undefined {
  return MODULE_LIST.find((m) => m.id === id);
}

/** カテゴリ別にグルーピングして返す */
export function getModulesGroupedByCategory(): Record<ModuleCategory, readonly ModuleListEntry[]> {
  const grouped: Record<string, ModuleListEntry[]> = {};
  for (const mod of MODULE_LIST) {
    if (!grouped[mod.category]) {
      grouped[mod.category] = [];
    }
    grouped[mod.category].push(mod);
  }
  return grouped as Record<ModuleCategory, readonly ModuleListEntry[]>;
}

/** API エンドポイント一覧を取得 (情報表示用) */
export function getApiEndpointSummary(): Array<{ id: string; name: string; path: string; status: ModuleStatus }> {
  return MODULE_LIST.map((m) => ({
    id: m.id,
    name: m.name,
    path: m.apiBasePath,
    status: m.status,
  }));
}
