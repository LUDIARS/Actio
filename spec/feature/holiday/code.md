# Holiday コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/holiday/routes.ts` | 休日・休業期間の CRUD API ルート |
| `modules/holiday/utils.ts` | スケジュール配置時の休日考慮ユーティリティ（営業日計算、ブロック判定） |
| `modules/holiday/japanese-holidays.ts` | 日本の祝日計算エンジン（1900〜2099年、振替休日対応） |

## 依存関係

- `src/db/repository.ts` — `holidayRepo` を使用
- `src/db/schema.ts` — `holidays` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/holidays | 休日一覧取得 |
| POST | /api/holidays | 休日登録 |
| PUT | /api/holidays/:id | 休日更新 |
| DELETE | /api/holidays/:id | 休日削除 |
| POST | /api/holidays/sync-japanese | 日本の祝日同期 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| グループ管理（個別予定タブ） | `frontend/src/pages/GroupsPage.tsx` |
| オートスケジューラ（休日オプション） | `frontend/src/pages/SmartSchedulerPage.tsx` |
