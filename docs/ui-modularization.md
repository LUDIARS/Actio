# UI モジュール化・ブロック/ウィジェットシステム設計書

## 1. 概要

Schedula フロントエンドの UI をモジュール単位で分離し、各モジュールがメニュー項目・UIブロック(ウィジェット)・ルートを**プラグイン的に登録**できるアーキテクチャに移行する。

### 目的

- コアUI (Dashboard, Layout, App) からモジュール固有コードの依存を切り離す
- 新モジュール追加時にコアファイルの変更を最小化する
- ダッシュボード等のページに各モジュールがウィジェットを自由に配置できるようにする
- メニューをモジュール単位で階層化し、視認性を向上させる

---

## 2. 新アーキテクチャ

### 2.1 モジュールレジストリ (`module-registry.ts`)

中央レジストリパターンで、各モジュールが自身の定義を登録する。

```
frontend/src/lib/
├── module-registry.ts       # レジストリ本体 + インタフェース定義
└── modules/
    ├── index.ts             # 全モジュール登録エントリポイント
    ├── core.ts              # コア (Dashboard, Profile, Help)
    ├── schedule.ts          # スケジュール (Calendar, MyPlan, Reminder)
    ├── group.ts             # グループ管理
    ├── m1-school.ts         # M1 学校管理 (Schema, Data)
    ├── reservation.ts       # 予約 (Reservation, Voting)
    ├── pm.ts                # M2 PM
    ├── machina.ts           # M3 MACHINA
    ├── notification.ts      # M5 通知
    ├── integration.ts       # 外部連携 (Integrations, API Keys)
    └── admin.ts             # 管理 (Users, Settings, Logs, DB, Secrets)
```

### 2.2 プラグインインタフェース

#### メニュープラグイン

```typescript
interface MenuItem {
  to: string;           // ルートパス
  label: string;        // 表示名
  icon?: string;        // アイコン文字
  adminOnly?: boolean;  // 管理者限定
  removable?: boolean;  // ユーザーが非表示切替可能
  order?: number;       // 表示順
}

interface MenuGroup {
  id: string;              // グループID
  label: string;           // カテゴリ名
  order: number;           // グループ表示順
  adminOnly?: boolean;     // 管理者限定グループ
  defaultCollapsed?: boolean;
  items: MenuItem[];       // グループ内メニュー項目
}
```

#### UIブロック(ウィジェット)プラグイン

```typescript
interface UIBlock {
  id: string;                        // ブロックID
  title: string;                     // タイトル
  component: ComponentType<UIBlockProps>; // Reactコンポーネント
  slot: UIBlockSlot;                 // 配置先スロット
  order: number;                     // 表示順
  requiredRole?: "admin" | "group_leader";
  defaultVisible?: boolean;          // デフォルト表示
  size?: "small" | "medium" | "large" | "full";
}

// 配置可能なスロット
type UIBlockSlot =
  | "dashboard-top"      // ダッシュボード上部
  | "dashboard-main"     // ダッシュボードメイン領域
  | "dashboard-sidebar"  // ダッシュボードサイドバー
  | "dashboard-bottom"   // ダッシュボード下部
  | "page-header"        // ページヘッダー
  | "page-footer";       // ページフッター
```

#### モジュール定義

```typescript
interface ModuleDefinition {
  id: string;
  name: string;
  description?: string;
  menuGroups?: MenuGroup[];      // 階層メニュー
  menuItems?: MenuItem[];        // トップレベルメニュー
  blocks?: UIBlock[];            // UIブロック
  routes?: ModuleRoute[];        // ルート定義
}
```

### 2.3 UIブロックレンダラー (`UIBlockRenderer.tsx`)

指定スロットに登録済みブロックを描画するコンポーネント。

```tsx
<UIBlockRenderer slot="dashboard-main" />
```

- ブロックの表示/非表示をユーザーが `localStorage` で制御可能
- 編集モードで +/− ボタンでトグル

### 2.4 階層メニュー

サイドバーメニューがモジュール単位でグループ化される。

```
Dashboard
プロフィール
────────────────
▼ スケジュール
    カレンダー
    マイプラン
    リマインダー
▼ グループ
    グループ管理
▼ M1 学校管理      (admin)
    スキーマ管理
    データ管理
▼ 予約
    予約管理
    日程調整
▼ M2 PM
    ダッシュボード
▼ M3 MACHINA
    MACHINA
▼ M5 通知
    通知管理
▼ 外部連携
    連携設定
    API連携
────────────────
▼ 管理
    ユーザー管理
    設定            (admin)
    操作ログ        (admin)
    DB Viewer       (admin)
    シークレット    (admin)
────────────────
ヘルプ
```

各グループは折りたたみ可能、状態は `localStorage` に保持。

---

## 3. コアUIに影響するモジュール一覧 (リファクタ対象)

### 3.1 Dashboard.tsx への依存

Dashboard は現在以下のモジュールAPIを**直接インポート**している。
将来的にはこれらをUIブロックとして各モジュール側に移動し、
Dashboard は `<UIBlockRenderer slot="dashboard-main" />` のみ描画する形に移行する。

| 依存元 | 使用API | モジュール | リファクタ方針 |
|--------|---------|-----------|--------------|
| Dashboard.tsx:4 | `calendarApi.getStatus()` | Calendar | → `GoogleStatusBlock` ウィジェット化 |
| Dashboard.tsx:4 | `calendarApi.getPersonalEvents()` | Calendar | → `TodayScheduleBlock` ウィジェット化 |
| Dashboard.tsx:4 | `calendarApi.getConflicts()` | Calendar | → `ConflictWarningBlock` ウィジェット化 |
| Dashboard.tsx:4 | `calendarApi.getEvents()` | Calendar | → `CalendarBlock` ウィジェット化 |
| Dashboard.tsx:4 | `groupApi.listMyGroups()` | Group | → `TodayScheduleBlock` に統合 |
| Dashboard.tsx:4 | `groupApi.getGroup()` | Group | → `TodayScheduleBlock` に統合 |
| Dashboard.tsx:4 | `myPlanApi.list()` | MyPlan | → `TodayScheduleBlock` に統合 |
| Dashboard.tsx:6 | `HelpButton` | Core | 共通コンポーネント (変更不要) |
| Dashboard.tsx:7 | `DAY_LABELS`, `getPeriodLabel` | Core | 共通定数 (変更不要) |

**リファクタ後の Dashboard イメージ:**
```tsx
function Dashboard() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <UIBlockRenderer slot="dashboard-top" />
      <UIBlockRenderer slot="dashboard-main" />
      <UIBlockRenderer slot="dashboard-bottom" />
    </div>
  );
}
```

### 3.2 App.tsx への依存

App.tsx は現在 **23ページコンポーネントを直接インポート**している。
将来的には `moduleRegistry.getRoutes()` を使って動的ルート生成に移行する。

| ページ | インポート元 | モジュール |
|--------|------------|----------|
| `Dashboard` | pages/Dashboard.tsx | Core |
| `DataManagementPage` | pages/DataManagementPage.tsx | M1 School |
| `SchemaManagementPage` | pages/SchemaManagementPage.tsx | M1 School |
| `ReservationsPage` | pages/ReservationsPage.tsx | Reservation |
| `FacilityBookingPage` | pages/FacilityBookingPage.tsx | Reservation |
| `NotificationsPage` | pages/NotificationsPage.tsx | M5 Notification |
| `VotingPage` | pages/VotingPage.tsx | Reservation (Voting) |
| `CalendarPage` | pages/CalendarPage.tsx | Schedule |
| `GroupsPage` | pages/GroupsPage.tsx | Group |
| `MyPlanPage` | pages/MyPlanPage.tsx | Schedule |
| `ReminderPage` | pages/ReminderPage.tsx | Schedule |
| `UserManagementPage` | pages/UserManagementPage.tsx | Admin |
| `DbViewerPage` | pages/DbViewerPage.tsx | Admin |
| `SettingsPage` | pages/SettingsPage.tsx | Admin |
| `ActivityLogsPage` | pages/ActivityLogsPage.tsx | Admin |
| `SecretsPage` | pages/SecretsPage.tsx | Admin |
| `HelpPage` | pages/HelpPage.tsx | Core |
| `IntegrationsPage` | pages/IntegrationsPage.tsx | Integration |
| `ApiKeysPage` | pages/ApiKeysPage.tsx | Integration |
| `ProfilePage` | pages/ProfilePage.tsx | Core |
| `MachinaPage` | pages/MachinaPage.tsx | M3 MACHINA |
| `PMDashboardPage` | pages/PMDashboardPage.tsx | M2 PM |
| `PMProjectPage` | pages/PMProjectPage.tsx | M2 PM |
| `PMAnalyticsPage` | pages/PMAnalyticsPage.tsx | M2 PM |

### 3.3 ページ間のモジュール横断依存

以下のページは**他モジュールのAPIを直接インポート**している。
ブロック化の際に依存関係の整理が必要。

| ページ | 所属モジュール | 借用API | 借用元モジュール |
|--------|-------------|---------|--------------|
| SmartSchedulerPage | Reservation | `groupApi`, `m1Schema` | Group, M1 School |
| SettingsPage | Admin | `groupApi` | Group |
| ProfilePage | Core | `groupApi` | Group |
| FacilityBookingPage | Reservation | `groupApi` | Group |
| MachinaPage | M3 MACHINA | `groupApi` | Group |
| IntegrationsPage | Integration | `calendarApi` | Calendar |

**パターン:** `groupApi` が最も多くのモジュールに参照されるクロスカッティング依存。

### 3.4 共有リソース (変更不要)

以下はコア共有リソースとして全モジュールから参照されるが、モジュール化の対象外。

| ファイル | 内容 |
|---------|------|
| `lib/api-types.ts` | 全APIレスポンス型定義 |
| `lib/constants.ts` | `DAY_LABELS`, `PERIODS_COUNT`, 時限定義 |
| `contexts/AuthContext.tsx` | 認証コンテキスト |
| `components/HelpOverlay.tsx` | ヘルプボタン・オーバーレイ |
| `components/TimetableGrid.tsx` | 時間割グリッド共有コンポーネント |

---

## 4. リファクタロードマップ

### Phase 1 (完了)
- [x] `module-registry.ts` — レジストリ + インタフェース定義
- [x] `modules/*.ts` — 全10モジュール定義 (メニューグループ)
- [x] `Layout.tsx` — 階層メニュー化 (折りたたみ対応)
- [x] `UIBlockRenderer.tsx` — ブロック描画コンポーネント
- [x] `App.tsx` — モジュール登録呼び出し

### Phase 2 (次期)
- [ ] Dashboard のウィジェット分離
  - `GoogleStatusBlock` — Google連携ステータス
  - `TodayScheduleBlock` — 今日の予定 (個人 + グループ + マイプラン統合)
  - `ConflictWarningBlock` — バッティング警告
  - `MonthCalendarBlock` — 月間カレンダー
  - `QuickAccessBlock` — クイックアクセスリンク
- [ ] 各モジュールの `blocks/` ディレクトリにウィジェットコンポーネント配置
- [ ] Dashboard を `UIBlockRenderer` ベースに書き換え

### Phase 3 (将来)
- [ ] App.tsx のルート定義を `moduleRegistry.getRoutes()` + `React.lazy()` で動的化
- [ ] ページコンポーネントを各モジュールディレクトリに移動
- [ ] `api.ts` をモジュール別ファイルに分割
- [ ] `api-types.ts` をモジュール別型定義に分割
- [ ] `help-data.ts` を各モジュール側に移動

---

## 5. 新モジュール追加手順

### メニュー追加

```typescript
// frontend/src/lib/modules/my-feature.ts
import type { ModuleDefinition } from "../module-registry";

export const myFeatureModule: ModuleDefinition = {
  id: "my-feature",
  name: "新機能",
  menuGroups: [{
    id: "my-feature",
    label: "新機能",
    icon: "F",
    order: 450,  // 表示順 (既存グループの間に配置)
    items: [
      { to: "/my-feature", label: "メイン画面", removable: true, order: 0 },
      { to: "/my-feature/settings", label: "設定", adminOnly: true, order: 1 },
    ],
  }],
};
```

`modules/index.ts` で `registerModule()` を追加。

### UIブロック追加

```typescript
// frontend/src/lib/modules/my-feature.ts
import { MyFeatureWidget } from "../../components/blocks/MyFeatureWidget";

export const myFeatureModule: ModuleDefinition = {
  id: "my-feature",
  name: "新機能",
  blocks: [{
    id: "my-feature-summary",
    title: "新機能サマリー",
    component: MyFeatureWidget,
    slot: "dashboard-main",
    order: 50,
    defaultVisible: true,
    size: "medium",
  }],
  // ...menuGroups, routes
};
```

ブロックコンポーネントは `UIBlockProps` を受け取る:

```tsx
// frontend/src/components/blocks/MyFeatureWidget.tsx
import type { UIBlockProps } from "../../lib/module-registry";

export function MyFeatureWidget({ blockId }: UIBlockProps) {
  return (
    <div className="card">
      <h3>新機能サマリー</h3>
      {/* ... */}
    </div>
  );
}
```

---

## 6. モジュール依存グラフ

```
Core (Dashboard, Profile, Help)
  ├── Calendar API   ←── Calendar Module
  ├── Group API      ←── Group Module
  └── MyPlan API     ←── Schedule Module

Group Module (横断的依存 — 最多参照)
  ↑ SmartScheduler (Reservation)
  ↑ Settings (Admin)
  ↑ Profile (Core)
  ↑ FacilityBooking (Reservation)
  ↑ Machina (M3)

Calendar Module
  ↑ Integrations
  ↑ Dashboard (Core)

M1 School Module
  ↑ SmartScheduler (Reservation)

独立モジュール (他への依存なし):
  - M5 Notification
  - M6 Voting (→ Reservation グループ)
  - M2 PM
```
