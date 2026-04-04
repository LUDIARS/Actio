# M1: カリキュラム管理 コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/schedule/routes.ts` | 学科・講師・カリキュラム CRUD、CSV インポート、自動配置の API ルート |
| `modules/school/index.ts` | M1 カリキュラム + 施設予約サブモジュールのバンドルエントリポイント |

## 依存関係

- `src/db/repository.ts` — `departmentRepo`, `instructorRepo`, `curriculumRepo`, `availableSlotRepo`, `roomRepo` を使用
- `src/db/curriculum-schema.ts` — `departments`, `instructors`, `curricula`, `curriculumDepartments`, `terms`, `instructorAvailableSlots` テーブル定義
- `src/db/schema.ts` — `rooms`, `scheduleEntries` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST/PUT/DELETE | /api/school/m1/departments | 学科 CRUD |
| GET/POST/PUT/DELETE | /api/school/m1/instructors | 講師 CRUD |
| GET/POST/PUT/DELETE | /api/school/m1/curricula | カリキュラム CRUD |
| GET/POST/PUT/DELETE | /api/school/m1/terms | ターム CRUD |
| GET/PUT | /api/school/m1/available-slots | 出講可能スロット管理 |
| GET/POST/PUT/DELETE | /api/school/m1/rooms | 教室 CRUD |
| POST | /api/school/m1/import/csv | CSV インポート |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| データ管理 | `frontend/src/pages/DataManagementPage.tsx` |
| スキーマ管理 | `frontend/src/pages/SchemaManagementPage.tsx` |
