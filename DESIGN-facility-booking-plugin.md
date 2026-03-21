# 施設予約プラグイン化 & M1施設予約モジュール 設計書

## 概要

現在の「予約 (M4)」モジュールを以下の方針で再設計する:

1. **予約をプラグインアーキテクチャに変更** — 予約メニューから任意の「予定モジュール」を起動できる汎用フレームワーク化
2. **施設予約を M1 の一部として切り出し** — 現在の M4 ロジック (教室×曜日×コマの予約) を M1 サブモジュールに移動
3. **最終的にカレンダー予定で管理** — 予約確定後、カレンダーの personalEvent / groupEvent として登録

---

## 1. プラグインアーキテクチャ

### 1.1 予約プラグインインターフェース

```typescript
// src/shared/types.ts に追加

export interface ReservationPlugin {
  /** プラグイン識別子 (例: "facility", "voting", "custom") */
  id: string;
  /** 表示名 (例: "施設予約", "日程調整") */
  name: string;
  /** 説明 */
  description: string;
  /** アイコン名 (Lucide icon 等) */
  icon: string;
  /** バックエンド API ベースパス (例: "/api/m1/facility-booking") */
  apiBasePath: string;
  /** フロントエンドルートパス (例: "/reservations/facility") */
  frontendPath: string;
}
```

### 1.2 プラグインレジストリ (バックエンド)

```typescript
// src/reservation-plugins.ts (新規)

const plugins: ReservationPlugin[] = [];

export function registerReservationPlugin(plugin: ReservationPlugin) {
  plugins.push(plugin);
}

export function getReservationPlugins(): ReservationPlugin[] {
  return [...plugins];
}
```

`app.ts` にプラグイン一覧 API を追加:

```
GET /api/reservations/plugins → ReservationPlugin[]
```

各モジュールの初期化時に `registerReservationPlugin()` を呼ぶ。

### 1.3 フロントエンド: 予約ランチャーページ

現在の `ReservationsPage.tsx` を **ランチャー (プラグイン選択画面)** に変更。

```
/reservations          → プラグイン一覧 (カード形式で表示)
/reservations/facility → 施設予約 (M1サブモジュール)
/reservations/voting   → 日程調整 (既存 M6)
```

**UI イメージ:**
```
┌─────────────────────────────────────┐
│  予約・スケジュール管理              │
│                                     │
│  ┌──────────┐  ┌──────────┐        │
│  │ 🏢       │  │ 📅       │        │
│  │ 施設予約  │  │ 日程調整  │        │
│  │ 教室・会議│  │ 投票で   │        │
│  │ 室の予約  │  │ 日程決定  │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  ┌──────────┐                      │
│  │ ⚡       │                      │
│  │ スマート  │                      │
│  │ スケジュー│                      │
│  │ ラー     │                      │
│  └──────────┘                      │
└─────────────────────────────────────┘
```

---

## 2. 施設予約モジュール (M1 サブモジュール)

### 2.1 ファイル構成

```
modules/school/
  index.ts                  ← 既存 (SchulaModule)
  facility-booking/         ← 新規
    routes.ts               ← 施設予約エンドポイント
    index.ts                ← プラグイン登録
```

### 2.2 API エンドポイント

既存 M4 ルートを M1 配下に移動。パスを変更:

| 旧パス (M4)                        | 新パス (M1)                                    |
|------------------------------------|-------------------------------------------------|
| `POST /api/m4/reservations`        | `POST /api/m1/facility-booking/reservations`    |
| `GET  /api/m4/reservations`        | `GET  /api/m1/facility-booking/reservations`    |
| `GET  /api/m4/reservations/:id`    | `GET  /api/m1/facility-booking/reservations/:id`|
| `PUT  /api/m4/reservations/:id`    | `PUT  /api/m1/facility-booking/reservations/:id`|
| `DELETE /api/m4/reservations/:id`  | `DELETE /api/m1/facility-booking/reservations/:id`|
| `GET  /api/m4/rooms/availability`  | `GET  /api/m1/facility-booking/rooms/availability`|
| `GET  /api/m4/rooms/:id/schedule`  | `GET  /api/m1/facility-booking/rooms/:id/schedule`|

**後方互換:** 旧 `/api/m4/*` パスはそのまま残し、新パスへのリダイレクト or エイリアスとする。

### 2.3 カレンダー連携 (予約→カレンダー予定)

予約確定時に、カレンダーの予定として自動登録する機能を追加:

```typescript
// POST /api/m1/facility-booking/reservations のレスポンスに追加
{
  reservation: { ... },
  calendarEventId: "ev_xxx"  // 自動作成されたカレンダー予定ID (任意)
}
```

**フロー:**
1. ユーザが施設予約を作成
2. `reservationRepo.create()` で予約レコード作成
3. (オプション) `personalEventRepo.create()` で予約者のカレンダーに予定追加
4. 予約キャンセル時 → カレンダー予定も連動削除

**新リポジトリ関数:**
```typescript
// repository.ts に追加
reservationRepo.createWithCalendarEvent(data, calendarData) → { reservation, calendarEvent }
```

### 2.4 DB スキーマ変更

スキーマ変更は **なし**。既存の `reservations` テーブルをそのまま利用。

カレンダー連携のため、`reservations` テーブルに1カラム追加を検討:

```typescript
// schema.ts - reservations テーブルに追加
calendarEventId: text("calendar_event_id")  // 連携先カレンダー予定ID (nullable)
```

---

## 3. 既存モジュールのプラグイン化

### 3.1 スマートスケジューラ

現在 `ReservationsPage.tsx` のタブ2・タブ3にある「オートスケジューラ」「自動配置」を独立プラグインとして登録:

```typescript
registerReservationPlugin({
  id: "smart-scheduler",
  name: "スマートスケジューラ",
  description: "DPベースの自動配置",
  icon: "Zap",
  apiBasePath: "/api/smart-scheduler",
  frontendPath: "/reservations/smart-scheduler",
});
```

ただし、SmartSchedulerPage は既に独立ページとして存在する。
→ 予約ランチャーからは `/smart-scheduler` へリンクするだけでもよい。

### 3.2 日程調整 (Voting / M6)

```typescript
registerReservationPlugin({
  id: "voting",
  name: "日程調整",
  description: "投票で日程を決定",
  icon: "CalendarCheck",
  apiBasePath: "/api/voting",
  frontendPath: "/voting",
});
```

既存ページへのリンクとして登録。

---

## 4. 実装ステップ

### Phase 1: プラグインフレームワーク
1. `ReservationPlugin` インターフェース定義 (`src/shared/types.ts`)
2. プラグインレジストリ (`src/reservation-plugins.ts`)
3. `GET /api/reservations/plugins` エンドポイント追加 (`app.ts`)
4. フロントエンド: `ReservationsPage.tsx` をランチャーに改修
5. フロントエンド: `api.ts` にプラグイン一覧取得追加

### Phase 2: 施設予約の M1 切り出し
1. `modules/school/facility-booking/routes.ts` 作成 (M4 ロジック移植)
2. `modules/school/index.ts` にサブモジュール追加
3. プラグインとして登録
4. フロントエンド: `FacilityBookingPage.tsx` 作成 (既存の予約UI移植)
5. フロントエンド: `api.ts` に `facilityBooking` 名前空間追加
6. 旧 M4 パスの後方互換エイリアス設定

### Phase 3: カレンダー連携
1. `reservations` テーブルに `calendarEventId` カラム追加
2. 予約作成時のカレンダー予定自動生成
3. 予約キャンセル時のカレンダー予定連動削除
4. フロントエンド: カレンダーページで予約由来の予定を表示

### Phase 4: 既存モジュールのプラグイン登録
1. スマートスケジューラをプラグイン登録
2. 日程調整 (Voting) をプラグイン登録

---

## 5. 検討ポイント (要相談)

### Q1: プラグインの粒度
- **案A:** プラグインは「ページリンク」だけ (ランチャーからリンクするだけ)
- **案B:** プラグインは共通の CRUD インターフェースを持つ (create/list/cancel 等の共通操作)
- **案C:** プラグインはフロントエンドコンポーネントも動的にロード (React lazy import)

→ まずは **案A (リンク)** で始め、共通操作が見えてきたら **案B** に拡張するのが現実的か？

### Q2: 旧 M4 パスの扱い
- **残す:** `/api/m4/*` → `/api/m1/facility-booking/*` へプロキシ (後方互換)
- **削除:** 旧パスは廃止、フロントだけ書き換え

→ 外部連携がなければ削除でよいか？

### Q3: カレンダー連携のタイミング
- **予約作成時に即カレンダー登録** (デフォルト)
- **確定ステータス変更時にカレンダー登録** (承認フロー付き)
- **手動でカレンダーにエクスポート** (ユーザ操作)

→ 現状は承認フローがないので「作成時に即登録」が最もシンプル。

### Q4: スマートスケジューラとの関係
- 現在 `ReservationsPage` のタブにあるスケジューラ関連 UI は `SmartSchedulerPage` と重複している
- プラグイン化で `ReservationsPage` からスケジューラタブを除去し、ランチャーからのリンクに統一するか？

---

## 6. 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/shared/types.ts` | `ReservationPlugin` 型追加 |
| `src/reservation-plugins.ts` | 新規: プラグインレジストリ |
| `src/app.ts` | プラグイン API 追加、施設予約ルート登録 |
| `modules/school/index.ts` | サブモジュールに施設予約追加 |
| `modules/school/facility-booking/` | 新規: 施設予約ルート |
| `modules/reservation/routes.ts` | 後方互換エイリアス or 削除 |
| `src/db/schema.ts` | `calendarEventId` カラム追加 |
| `src/db/repository.ts` | カレンダー連携リポジトリ関数追加 |
| `frontend/src/pages/ReservationsPage.tsx` | ランチャーUIに改修 |
| `frontend/src/pages/FacilityBookingPage.tsx` | 新規: 施設予約UI |
| `frontend/src/lib/api.ts` | `facilityBooking` 名前空間追加、プラグイン API 追加 |
| `frontend/src/App.tsx` | ルート追加 (`/reservations/facility`) |
