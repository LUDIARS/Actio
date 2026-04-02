# カレンダーモジュール計画書

## 概要

Google Calendar 連携と手動予定管理を提供するコアモジュール。ユーザのカレンダーイベント取得、プラン (マイプラン) の予定反映、personalEvent によるシステム内予定の一元管理を担う。

---

## モジュール構成

```
modules/calendar/
├── PLAN.md                     # 本設計書
└── routes.ts                   # カレンダー API ルート
```

---

## 1. 主要機能

### 1.1 Google Calendar 連携

- OAuth 2.0 トークンによる認証
- リフレッシュトークンによる自動更新 (有効期限 60 秒バッファ)
- カレンダー一覧取得 & イベント取得 (デフォルト 7 日間)
- スコープ: `calendar.readonly` / `calendar.events`
- 接続解除 (パスワード確認後)

### 1.2 手動予定 (personalEvent)

- システム内で管理するユーザ個人の予定
- 施設予約やマイプランから自動生成される予定の受け皿
- 時刻ベースとピリオドベースの両方をサポート

### 1.3 プラン管理

- マイプラン (weeklySchedule) との連携
- プランから personalEvent への変換

---

## 2. API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/events` | Google Calendar イベント取得 (7 日間) |
| GET | `/calendars` | カレンダー一覧 |
| GET | `/status` | 接続状態確認 |
| POST | `/disconnect` | Google Calendar 接続解除 |
| GET | `/personal-events` | 手動予定一覧 |
| POST | `/personal-events` | 手動予定作成 |
| PUT | `/personal-events/:id` | 手動予定更新 |
| DELETE | `/personal-events/:id` | 手動予定削除 |
| GET | `/plans` | プラン一覧 |
| GET | `/conflicts` | 予定の競合チェック |

---

## 3. 時間変換

```
ピリオド 0 → 09:30 - 10:30
ピリオド 1 → 10:30 - 11:30
...
ピリオド 10 → 19:30 - 20:30
```

1 コマ = 60 分、09:30 開始。

---

## 4. 依存モジュール

| モジュール | 用途 |
|-----------|------|
| auth | Google OAuth トークン管理 |
| secrets | CLIENT_ID / CLIENT_SECRET の取得 |

---

## 5. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| CalendarPage | `/calendar` | カレンダー表示 & 予定管理 |
