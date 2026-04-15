# Auth コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `src/auth/routes.ts` | 認証 API ルート定義。@actio/id-service に委譲し、JWT 発行・セッション管理を行う |

## 依存関係

- `src/db/repository.ts` — `userRepo`, `sessionRepo` を使用
- `src/db/schema.ts` — `users`, `sessions`, `userProfiles`, `userProjectRoles` テーブル定義
- `src/middleware/` — 認証ミドルウェア (JWT 検証、ユーザー ID 抽出)
- `src/config/` — JWT 設定、Google OAuth クレデンシャル

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/auth/register | ユーザー登録 |
| POST | /api/auth/login | パスワードログイン |
| GET | /api/auth/google | Google OAuth 開始 |
| GET | /api/auth/google/callback | Google OAuth コールバック |
| POST | /api/auth/refresh | トークンリフレッシュ |
| POST | /api/auth/logout | ログアウト |
| GET | /api/auth/me | 現在のユーザー情報取得 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| ログイン | `frontend/src/pages/LoginPage.tsx` |
| ユーザー管理 | `frontend/src/pages/UserManagementPage.tsx` |
