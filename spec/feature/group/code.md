# Group コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/group/routes.ts` | グループ CRUD、メンバー管理、ロールベース権限チェックの API ルート |

## 依存関係

- `src/db/repository.ts` — `groupRepo`, `groupMemberRepo`, `groupScheduleRepo`, `groupEventRepo` を使用
- `src/db/schema.ts` — `groups`, `groupMembers`, `groupSchedules`, `groupEvents` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/groups | グループ一覧 |
| POST | /api/groups | グループ作成 |
| GET | /api/groups/:id | グループ詳細 |
| PUT | /api/groups/:id | グループ更新 |
| DELETE | /api/groups/:id | グループ削除 |
| GET | /api/groups/:id/members | メンバー一覧 |
| POST | /api/groups/:id/members | メンバー追加 |
| DELETE | /api/groups/:id/members/:userId | メンバー削除 |
| GET | /api/groups/:id/schedules | グループ予定一覧 |
| POST | /api/groups/:id/schedules | グループ予定登録 |
| GET | /api/groups/:id/events | グループイベント一覧 |
| POST | /api/groups/:id/events | グループイベント登録 |
| PUT | /api/groups/:id/events/:eventId | グループイベント更新 |
| DELETE | /api/groups/:id/events/:eventId | グループイベント削除 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| グループ管理 | `frontend/src/pages/GroupsPage.tsx` |
