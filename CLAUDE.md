# Schedula 開発ルール

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

### その他モジュール

- **予約システム** (`modules/reservation/`) — M4 (`/api/reservations`)
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
| `modules/reservation/` | `frontend/src/pages/ReservationsPage.tsx` | `api.ts` の `m4` |
| `modules/notification/` | `frontend/src/pages/NotificationsPage.tsx` | `api.ts` の `m5` |
| `modules/voting/` | `frontend/src/pages/VotingPage.tsx` | `api.ts` の `m6Voting` |
| `src/auth/` | `frontend/src/pages/LoginPage.tsx`, `UserManagementPage.tsx` | `api.ts` の `auth` |

## プロジェクト構造

- `src/` — バックエンド (Hono + TypeScript)
- `frontend/` — フロントエンド (React 19 + Vite)
- `modules/` — 機能モジュール
- `src/db/schema.ts` — メインスキーマ
- `src/db/curriculum-schema.ts` — M1 カリキュラムスキーマ
- `src/db/repository.ts` — リポジトリ抽象化層
- `src/db/dialects/` — DB方言別の接続実装
