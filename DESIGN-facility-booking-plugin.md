# 施設予約プラグイン化 & M1施設予約モジュール 設計書

## 概要

現在の「予約 (M4)」モジュールを以下の方針で再設計する:

1. **予約をプラグインアーキテクチャに変更** — 共通 CRUD インターフェースを持つプラグインフレームワーク。各プラグインのデータは最終的にカレンダー予定形式に集約される。
2. **施設予約を M1 の一部として切り出し** — 現在の M4 ロジック (教室×曜日×コマの予約) を M1 サブモジュールに移動
3. **カレンダー予定で管理** — 予約作成時に即カレンダー予定として登録

### 決定事項

| 項目 | 決定 |
|------|------|
| プラグイン粒度 | 案B: 共通 CRUD インターフェース |
| 旧 M4 パス | 削除 (後方互換不要) |
| カレンダー連携 | 作成時に即登録 |
| スマートスケジューラ | ランチャーから除外 |

---

## 1. プラグインアーキテクチャ

### 1.1 共通カレンダー予定スキーマ

すべての予約プラグインは、最終的にこの共通スキーマに集約される。
プラグイン固有の中間スキーマを持つことは許容するが、確定時にこの形式でカレンダーに登録する。

```typescript
// src/shared/types.ts に追加

/** 予約プラグインが出力する共通カレンダー予定 */
export interface ReservationCalendarEvent {
  /** 予約者ユーザID */
  reservedBy: string;
  /** カレンダー予定ID (personalEvent.id) */
  calendarEventId: string;
  /** 開始日時 */
  startTime: string;  // ISO 8601
  /** 終了日時 */
  endTime: string;    // ISO 8601
  /** 予定名 */
  title: string;
  /** グループID (nullable) */
  groupId: string | null;
  /** 概要・備考 */
  description: string;
}
```

### 1.2 予約プラグインインターフェース

```typescript
// src/shared/types.ts に追加

export interface ReservationPlugin {
  /** プラグイン識別子 (例: "facility", "voting") */
  id: string;
  /** 表示名 (例: "施設予約", "日程調整") */
  name: string;
  /** 説明 */
  description: string;
  /** アイコン名 (Lucide icon) */
  icon: string;
  /** バックエンド API ベースパス (例: "/api/m1/facility-booking") */
  apiBasePath: string;
  /** フロントエンドルートパス (例: "/reservations/facility") */
  frontendPath: string;
  /** 共通 CRUD 操作のエンドポイントパス (apiBasePath からの相対) */
  operations: {
    /** 予約一覧取得: GET */
    list: string;
    /** 予約作成: POST */
    create: string;
    /** 予約キャンセル: DELETE /:id */
    cancel: string;
  };
}
```

### 1.3 プラグインレジストリ (バックエンド)

```typescript
// src/reservation-plugins.ts (新規)

import type { ReservationPlugin } from "./shared/types.js";

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

### 1.4 フロントエンド: 予約ランチャーページ

現在の `ReservationsPage.tsx` を **ランチャー (プラグイン選択画面)** に改修。

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
└─────────────────────────────────────┘
```

※ スマートスケジューラはランチャーに含めない (独立ページとして運用)

### 1.5 共通 CRUD フロー

各プラグインは以下の共通操作を実装する:

```
POST   {apiBasePath}/reservations     → 予約作成 + カレンダー予定即時登録
GET    {apiBasePath}/reservations     → 予約一覧 (ReservationCalendarEvent[] 形式を含む)
DELETE {apiBasePath}/reservations/:id → 予約キャンセル + カレンダー予定連動削除
```

**共通フロー:**
1. ユーザがプラグイン固有UIで予約情報を入力
2. プラグインが中間データを処理 (例: 施設予約なら空き教室チェック)
3. 予約確定 → `personalEventRepo.create()` でカレンダー予定を即時登録
4. 予約キャンセル → カレンダー予定も連動削除

---

## 2. 施設予約モジュール (M1 サブモジュール)

### 2.1 ファイル構成

```
modules/school/
  index.ts                  ← 既存 (SchulaModule) に施設予約サブモジュール追加
  facility-booking/         ← 新規
    routes.ts               ← 施設予約エンドポイント (旧M4ロジック移植)
    index.ts                ← プラグイン登録
```

### 2.2 API エンドポイント

旧 M4 ルートを M1 配下に移動。**旧パスは削除。**

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/m1/facility-booking/reservations` | POST | 施設予約作成 + カレンダー予定登録 |
| `/api/m1/facility-booking/reservations` | GET | 施設予約一覧 |
| `/api/m1/facility-booking/reservations/:id` | GET | 施設予約詳細 |
| `/api/m1/facility-booking/reservations/:id` | PUT | 施設予約更新 |
| `/api/m1/facility-booking/reservations/:id` | DELETE | 施設予約キャンセル + カレンダー予定削除 |
| `/api/m1/facility-booking/rooms/availability` | GET | 教室空き状況 |
| `/api/m1/facility-booking/rooms/:roomId/schedule` | GET | 教室スケジュール |

### 2.3 カレンダー連携

**予約作成時:**
1. `reservationRepo.create()` で予約レコード作成
2. `personalEventRepo.create()` で予約者のカレンダーに予定登録
3. レスポンスに `calendarEventId` を含める

**予約キャンセル時:**
1. `reservationRepo` で予約ステータスを `cancelled` に変更
2. `personalEventRepo` で連携カレンダー予定を削除

### 2.4 DB スキーマ変更

`reservations` テーブルに1カラム追加:

```typescript
// schema.ts - reservations テーブル
calendarEventId: text("calendar_event_id")  // 連携先カレンダー予定ID (nullable)
```

---

## 3. 既存モジュールのプラグイン登録

### 3.1 日程調整 (Voting / M6)

```typescript
registerReservationPlugin({
  id: "voting",
  name: "日程調整",
  description: "投票で日程を決定",
  icon: "CalendarCheck",
  apiBasePath: "/api/voting",
  frontendPath: "/voting",
  operations: {
    list: "/events",
    create: "/events",
    cancel: "/events",
  },
});
```

既存の VotingPage へ遷移。将来的に確定した日程をカレンダー予定に変換する拡張が可能。

---

## 4. 実装ステップ

### Phase 1: プラグインフレームワーク
1. `ReservationPlugin` / `ReservationCalendarEvent` 型定義 (`src/shared/types.ts`)
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
6. 旧 M4 ルートとフロントエンド参照を削除

### Phase 3: カレンダー連携
1. `reservations` テーブルに `calendarEventId` カラム追加
2. 予約作成時のカレンダー予定自動生成ロジック
3. 予約キャンセル時のカレンダー予定連動削除
4. フロントエンド: カレンダーページで予約由来の予定を表示

### Phase 4: 日程調整プラグイン登録
1. Voting モジュールをプラグイン登録

---

## 5. 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/shared/types.ts` | `ReservationPlugin`, `ReservationCalendarEvent` 型追加 |
| `src/reservation-plugins.ts` | 新規: プラグインレジストリ |
| `src/app.ts` | プラグイン API 追加、施設予約ルート登録、旧M4ルート削除 |
| `modules/school/index.ts` | サブモジュールに施設予約追加 |
| `modules/school/facility-booking/` | 新規: 施設予約ルート |
| `modules/reservation/routes.ts` | 削除 |
| `src/db/schema.ts` | `calendarEventId` カラム追加 |
| `src/db/repository.ts` | カレンダー連携リポジトリ関数追加 |
| `frontend/src/pages/ReservationsPage.tsx` | ランチャーUIに改修 |
| `frontend/src/pages/FacilityBookingPage.tsx` | 新規: 施設予約UI (旧ReservationsPage予約タブ移植) |
| `frontend/src/lib/api.ts` | `facilityBooking` 名前空間追加、旧 `m4` 削除、プラグイン API 追加 |
| `frontend/src/App.tsx` | ルート追加 (`/reservations/facility`)、旧ルート調整 |
