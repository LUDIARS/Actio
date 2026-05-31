# M1: 時間割自動生成 コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/schedule/routes.ts` | 自動配置・入れ替え・確定の API ルート（カリキュラム管理と同一ファイル） |

## 依存関係

- `src/db/repository.ts` — `scheduleEntryRepo`, `curriculumRepo`, `roomRepo`, `availableSlotRepo` を使用
- `src/db/curriculum-schema.ts` — `curriculumPlacements` テーブル定義
- `src/db/schema.ts` — `scheduleEntries` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/school/m1/schedule/generate | 時間割自動生成 |
| POST | /api/school/m1/schedule/swap | コマ入れ替え |
| POST | /api/school/m1/schedule/confirm | 時間割確定 |
| GET | /api/school/m1/schedule | 配置結果取得 |
| POST | /api/school/m1/migration/departments-to-groups | 学科→グループ自動変換 |
| POST | /api/school/m1/migration/schedule-to-plans | 配置→プラン自動変換 |
| GET | /api/school/m1/migration/status | マイグレーション状態確認 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| スキーマ管理（時間割グリッド） | `frontend/src/pages/SchemaManagementPage.tsx` |
