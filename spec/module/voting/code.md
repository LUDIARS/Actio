# Voting コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/voting/routes.ts` | 投票イベント作成・回答・集計の API ルート |
| `modules/voting/auto-reply.ts` | カレンダー空き状況に基づく自動回答生成 |

## 依存関係

- `src/db/schema.ts` — `votingEvents`, `votingCandidates`, `votes` テーブル定義
- `src/reservation-plugins.ts` — 予約プラグインとして登録
- `modules/calendar/` — 空き状況取得（自動回答用）

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST | /api/voting/events | イベント一覧・作成 |
| GET | /api/voting/events/:id | イベント詳細（集計付き） |
| POST | /api/voting/events/:id/candidates | 候補日時追加 |
| POST | /api/voting/events/:id/vote | 投票回答 |
| POST | /api/voting/events/:id/auto-reply | 自動回答実行 |
| PATCH | /api/voting/events/:id/close | イベント close |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| 日程調整 | `frontend/src/pages/VotingPage.tsx` |
