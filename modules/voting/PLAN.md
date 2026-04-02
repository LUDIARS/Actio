# 日程調整 Voting モジュール計画書

## 概要

投票による日程調整モジュール。○△× の 3 段階回答で候補日の最適な日程を決定する。自動回答生成機能を含み、予約プラグインシステムにも対応。

---

## モジュール構成

```
modules/voting/
├── PLAN.md                     # 本設計書
├── routes.ts                   # Voting API ルート
└── auto-reply.ts               # 自動回答生成 (カレンダー空き状況ベース)
```

---

## 1. データモデル

### 1.1 投票イベント (VotingEvent)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー |
| title | string | イベント名 |
| description | string | 説明 |
| createdBy | string | 作成者 |
| deadline | string? | 回答期限 |
| status | string | open / closed |

### 1.2 候補日 (VotingCandidate)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー |
| eventId | string | 投票イベント FK |
| label | string | 候補日ラベル (例: "4/5 10:00〜") |
| sortOrder | number | 表示順 |

### 1.3 投票 (Vote)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| userId | string | 回答者 |
| candidateId | string | 候補日 FK |
| answer | string | ok (○) / maybe (△) / ng (×) |
| isAutoReply | boolean | 自動回答かどうか |
| comment | string | コメント |

---

## 2. API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/events` | 投票イベント作成 |
| GET | `/events` | イベント一覧 |
| GET | `/events/:id` | イベント詳細 + 集計 |
| PUT | `/events/:id` | イベント更新 |
| DELETE | `/events/:id` | イベント削除 |
| POST | `/events/:id/close` | 投票締め切り |
| POST | `/events/:id/votes` | 投票送信 |
| GET | `/events/:id/summary` | 集計サマリー |

---

## 3. 自動回答機能

ユーザのカレンダー (personalEvent + Google Calendar) を参照し、各候補日の空き状況に基づいて自動的に ○/△/× を設定する。

---

## 4. 予約プラグイン

`ReservationPlugin` インターフェースに準拠し、`GET /api/reservations/plugins` から `voting` として登録。

---

## 5. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| VotingPage | `/voting` | 日程調整 UI |
| ReservationsPage | `/reservations` | プラグインランチャーからアクセス |
