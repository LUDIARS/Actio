# Schedula 開発ルール

## CI テスト必須ルール

**コードを変更したら、push する前に必ず CI と同じテストを全て実行し、全て通ることを確認してください。** テストが失敗する場合は、通るまで修正してから push してください。

### CI で実行されるチェック

1. **バックエンドビルド (型チェック):** `npm run build`
2. **バックエンドテスト:** `npm test`
3. **フロントエンド Lint:** `cd frontend && npm run lint` (エラーが 0 であること。warning は許容)
4. **フロントエンドビルド:** `cd frontend && npm run build`

### やること

1. 変更が完了したら上記 4 つのコマンドを全て実行する
2. 失敗があれば修正して再実行する
3. 全て通過してから `git push` する
4. テストが通らない状態のコードを push してはいけない

## データベースアクセス

**ルートハンドラから `db` を直接操作してはいけません。** 必ず `src/db/repository.ts` のリポジトリ層を経由してください。

### なぜ？

- 本プロジェクトは SQLite / PostgreSQL / MySQL をサポートしており、`.all()` `.run()` `.get()` 等の SQLite 固有メソッドは PostgreSQL で動かない
- リポジトリ層は `await db.select().from(...)` 等の Drizzle ORM 汎用 API のみを使用し、方言差異を吸収する
- ルートハンドラをシンプルに保ち、テスタビリティを確保する

### やること

1. 新しいテーブルや操作が必要な場合、まず `src/db/repository.ts` にリポジトリ関数を追加する
2. ルートハンドラからはリポジトリ関数を呼び出す
3. リポジトリ内では必ず `await` を付けて Drizzle クエリを実行する（`.all()` `.run()` `.get()` は使用禁止）

### 例

```typescript
// ✅ 正しい: リポジトリ経由
import { departmentRepo } from "../../src/db/repository.js";

m1.get("/departments", async (c) => {
  const departments = await departmentRepo.findAll();
  return c.json({ departments });
});

// ❌ 間違い: 直接 db アクセス
import { db, curriculumSchema } from "../../src/db/connection.js";

m1.get("/departments", async (c) => {
  const rows = db.select().from(curriculumSchema.departments).all(); // SQLite 固有！
  return c.json({ departments: rows });
});
```

### 既存リポジトリ

- `userRepo` / `sessionRepo` — 認証関連
- `departmentRepo` / `instructorRepo` / `curriculumRepo` / `availableSlotRepo` — M1 カリキュラム関連
- `personalEventRepo` / `planRepo` / `myPlanRepo` — カレンダー・プラン関連
- `groupRepo` / `groupMemberRepo` / `groupScheduleRepo` — グループ関連
- `scheduleEntryRepo` / `roomRepo` — スケジュール・教室関連
- `schedulingTaskRepo` / `schedulingResultRepo` — スマートスケジューラ関連
- `holidayRepo` — 休日・休業期間管理
- `groupEventRepo` — グループ個別予定 (日付ベース)
- `pmProjectRepo` / `pmTaskRepo` / `pmTaskSnapshotRepo` / `pmMilestoneRepo` — PM プロジェクト管理関連
- `pmTaskValidationRepo` / `pmConflictRepo` / `pmAnalyticsCacheRepo` — PM 検証・コンフリクト・分析関連

## TypeScript コーディングルール

**`any` 型を使用してはいけません。** 必ず適切な型注釈を付けてください。

### なぜ？

- `any` は型チェックを無効化し、実行時エラーの原因になる
- `noImplicitAny` が有効なため、`any` を使うとビルドエラーになる
- 型安全性を保つことで、リファクタリングやコードレビューの品質が向上する

### やること

1. 関数の引数・戻り値には明示的な型を付ける
2. コールバック関数のパラメータにも型注釈を付ける（例: `.map((r: Room) => ...)`）
3. `any` の代わりに `unknown` や具体的な型、ジェネリクスを使用する
4. リポジトリの戻り値型は Drizzle の推論型（`typeof schema.table.$inferSelect`）を活用する

### 例

```typescript
// ✅ 正しい: 明示的な型
const rooms = await roomRepo.findAll();
const roomMap = new Map(rooms.map((r: { id: string; name: string }) => [r.id, r.name]));

// ❌ 間違い: any 型
const roomMap = new Map(rooms.map((r: any) => [r.id, r.name]));
```

## アーキテクチャ

### コア機能 (基本実装)

- **ユーザ** (`src/auth/`) — 認証・ユーザ管理
- **グループ** (`modules/group/`) — グループ管理 (`/api/groups`)
- **マイプラン** (`modules/myplan/`) — 週間ルーティーン (`/api/myplans`)
- **自動配置スケジューラ** (`modules/smart-scheduler/`) — DP自動配置 (`/api/smart-scheduler`)
- **カレンダー** (`modules/calendar/`) — Google Calendar連携 + 手動予定 (`/api/calendar`)

### M1: 学校カリキュラム管理モジュール

`modules/schedule/` + `modules/school/` — 学校・教育機関向けカリキュラム管理

- 学科・講師・カリキュラムの CRUD
- カリキュラムに期間 (validFrom / validUntil) を設定可能
- **マイグレーション機能:**
  - `POST /api/school/m1/migration/departments-to-groups` — 登録学科をグループに自動登録
  - `POST /api/school/m1/migration/schedule-to-plans` — カリキュラム配置データをプラン形式に自動変換
  - `GET /api/school/m1/migration/status` — マイグレーション状態確認

旧 M2 (データ統合) と旧 M3 (オートスケジューラ) は M1 に統合済み。

- **施設予約** (`modules/school/facility-booking/`) — M1 サブモジュール
  - 教室・会議室の予約管理 (`/api/school/m1/facility-booking`)
  - 予約作成時にカレンダー予定 (personalEvent) を即時登録
  - 予約キャンセル時にカレンダー予定を連動削除
  - 予約プラグインとして登録 (`GET /api/reservations/plugins`)

### 予約プラグインシステム

`src/reservation-plugins.ts` — 予約モジュールのプラグインフレームワーク

- `ReservationPlugin` インターフェース: 共通 CRUD 操作 (list/create/cancel)
- `ReservationCalendarEvent` 共通スキーマ: 全プラグインのデータはカレンダー予定に集約
- `GET /api/reservations/plugins` — 登録済みプラグイン一覧
- フロントエンド `/reservations` はランチャー画面 (プラグイン選択)
- 登録済みプラグイン: 施設予約 (`facility`), 日程調整 (`voting`)

### 休日管理モジュール

`modules/holiday/` — 休日・休業期間管理 (`/api/holidays`)

- 日本の祝日自動取得 (ルールベース計算)
- 休日のDB同期 (日本の祝日を一括登録)
- グループ固有の休日・審査会期間管理
- スケジュール配置時の休日考慮ユーティリティ
- グループの個別予定 (日付ベースの行事・休日・審査会期間) — `GET/POST/PUT/DELETE /api/groups/:id/events`

### M2: PM (プロジェクト管理) モジュール

`modules/pm/` — GitHub/Notion タスク同期・分析 (`/api/pm`)

- プロジェクト作成 (GitHub Issues / Notion Database 接続)
- 双方向タスク同期 (Pull: 外部→Schedula, Push: Schedula→外部)
- 差分検知 & コンフリクト解決 (フィールドマージ / 外部優先)
- タスク内容検証 (充実度スコア・改善提案)
- リマインダー (納期警告・超過通知)
- クリティカルパス分析・タスク分解推奨
- ゴンペルツ曲線 (バグ収束予測)

### その他モジュール

- **通知** (`modules/notification/`) — M5 (`/api/webhooks`)
- **日程調整Voting** (`modules/voting/`) — M6 (`/api/voting`)

## モジュール修正ルール

**モジュール (`modules/`) のバックエンドを修正する際は、対応するフロントエンド (`frontend/`) も必ず合わせて修正すること。**

### なぜ？

- バックエンドの API レスポンス形式やエンドポイントを変更した場合、フロントエンドが壊れる
- 新機能追加時にフロントエンド側の UI を忘れると、ユーザが機能にアクセスできない
- バックエンドとフロントエンドの整合性を常に保つことで、動作確認・レビューがスムーズになる

### やること

1. バックエンドの API を追加・変更・削除した場合、`frontend/src/lib/api.ts` の対応する API 呼び出しも更新する
2. 新しいエンドポイントを追加した場合、対応するフロントエンドページ (`frontend/src/pages/`) に UI を追加する
3. レスポンス形式を変更した場合、フロントエンド側の型定義とデータ処理も合わせて修正する
4. バックエンドのバリデーションルールを変更した場合、フロントエンドのフォームバリデーションも同期する

### 対応関係

| バックエンドモジュール | フロントエンドページ | API定義 |
|----------------------|--------------------|---------|
| `modules/schedule/` + `modules/school/` | `frontend/src/pages/DataManagementPage.tsx`, `SchemaManagementPage.tsx` | `api.ts` の `m1` |
| `modules/calendar/` | `frontend/src/pages/CalendarPage.tsx` | `api.ts` の `calendar` |
| `modules/group/` | `frontend/src/pages/GroupsPage.tsx` | `api.ts` の `groups` |
| `modules/myplan/` | `frontend/src/pages/MyPlanPage.tsx` | `api.ts` の `myplan` |
| `modules/smart-scheduler/` | `frontend/src/pages/SmartSchedulerPage.tsx` | `api.ts` の `smartScheduler` |
| `modules/school/facility-booking/` | `frontend/src/pages/ReservationsPage.tsx` (ランチャー), `FacilityBookingPage.tsx` | `api.ts` の `facilityBooking`, `reservationPluginsApi` |
| `modules/notification/` | `frontend/src/pages/NotificationsPage.tsx` | `api.ts` の `m5` |
| `modules/voting/` | `frontend/src/pages/VotingPage.tsx` | `api.ts` の `m6Voting` |
| `modules/holiday/` | `frontend/src/pages/GroupsPage.tsx` (個別予定), `SmartSchedulerPage.tsx` (休日オプション) | `api.ts` の `holidayApi`, `groupApi` |
| `modules/pm/` | `frontend/src/pages/PMDashboardPage.tsx`, `PMProjectPage.tsx`, `PMAnalyticsPage.tsx` | `api.ts` の `pmApi` |
| `src/auth/` | `frontend/src/pages/LoginPage.tsx`, `UserManagementPage.tsx` | `api.ts` の `auth` |

## プロジェクト構造

- `src/` — バックエンド (Hono + TypeScript)
- `frontend/` — フロントエンド (React 19 + Vite)
- `modules/` — 機能モジュール
- `src/db/schema.ts` — メインスキーマ
- `src/db/curriculum-schema.ts` — M1 カリキュラムスキーマ
- `src/db/repository.ts` — リポジトリ抽象化層
- `src/db/dialects/` — DB方言別の接続実装
