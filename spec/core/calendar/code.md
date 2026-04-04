# Calendar コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/calendar/routes.ts` | Google Calendar 連携、イベント同期、手動予定管理の API ルート |

## 依存関係

- `src/db/repository.ts` — `personalEventRepo` を使用
- `src/db/schema.ts` — `personalEvents`, `integrationSettings`, `syncLogs` テーブル定義
- `src/auth/` — Google OAuth トークン取得

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/calendar/events | 個人予定一覧 |
| POST | /api/calendar/events | 個人予定登録 |
| PUT | /api/calendar/events/:id | 個人予定更新 |
| DELETE | /api/calendar/events/:id | 個人予定削除 |
| POST | /api/calendar/sync | Google Calendar 同期実行 |
| GET | /api/calendar/slots | 統合スロット取得 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| カレンダー | `frontend/src/pages/CalendarPage.tsx` |
