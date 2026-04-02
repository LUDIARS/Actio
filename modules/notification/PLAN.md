# 通知・Webhook モジュール計画書

## 概要

Slack / Discord / LINE / 汎用 Webhook を通じた通知配信モジュール。イベントバスによるイベント駆動アーキテクチャで、各モジュールから発火されたイベントをユーザの通知設定に基づいて配信する。

---

## モジュール構成

```
modules/notification/
├── PLAN.md                     # 本設計書
├── routes.ts                   # 通知設定 & Webhook 管理 API
├── core/
│   ├── event-bus.ts            # イベント発火システム (emitEvent)
│   ├── template-engine.ts      # メッセージテンプレート処理
│   └── handler.ts              # イベントリスナー初期化
└── channels/
    ├── slack/delivery.ts       # Slack 配信
    ├── discord/delivery.ts     # Discord 配信
    ├── line/delivery.ts        # LINE 配信
    ├── webhook/
    │   ├── routes.ts           # Webhook CRUD
    │   └── delivery.ts         # 汎用 Webhook 配信
    └── platform-dispatcher.ts  # プラットフォーム振り分け
```

---

## 1. イベントバス

### 1.1 イベント発火

```typescript
emitEvent("schedule.confirmed", { scheduleId, termId, ... });
emitEvent("reservation.created", { reservationId, roomName, ... });
emitEvent("pm.task.created", { taskId, title, ... });
```

### 1.2 対応イベント

| モジュール | イベント |
|-----------|---------|
| schedule | schedule.confirmed, schedule.changed |
| reservation | reservation.created/updated/cancelled/reminder |
| calendar | sync.conflict |
| reminder | reminder.morning |
| pm | pm.task.created/updated/closed/reopened/assigned, pm.deadline.warning/overdue, pm.sync.* |
| machina | machina.task.created/updated/completed/assigned/relayed |

---

## 2. 通知設定

### 2.1 ユーザ通知プリファレンス

- **チャネル**: in_app / email / push / webhook
- **イベントフィルタ**: イベント種別ごとの有効/無効
- **リマインダー**: dayBefore, morningOf, beforeMinutes
- **クワイエットアワー**: 通知停止時間帯

### 2.2 テンプレートエンジン

イベント × プラットフォームごとにカスタマイズ可能なメッセージテンプレート。

---

## 3. API エンドポイント

### 3.1 通知設定

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/notifications/preferences` | 通知設定取得 |
| PUT | `/notifications/preferences` | 通知設定更新 |
| GET | `/notifications/history` | 通知履歴 |

### 3.2 Webhook 管理

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/webhooks` | Webhook 一覧 |
| POST | `/webhooks` | Webhook 作成 |
| PUT | `/webhooks/:id` | Webhook 更新 |
| DELETE | `/webhooks/:id` | Webhook 削除 |
| POST | `/webhooks/:id/test` | テスト送信 |
| POST | `/webhooks/:id/rotate` | シークレットローテーション |
| GET | `/webhooks/:id/logs` | 配信ログ |

### 3.3 テンプレート

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/templates` | テンプレート一覧 |
| POST | `/templates` | テンプレート作成 |
| PUT | `/templates/:id` | テンプレート更新 |
| POST | `/templates/preview` | プレビュー |
| POST | `/templates/test-send` | テスト送信 |

---

## 4. 配信フロー

```
[イベント発火]
    │
    ▼
┌──────────────────────┐
│  event-bus.ts         │  登録済みリスナーにイベント配信
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  handler.ts           │  対象ユーザの通知設定を確認
│                       │  クワイエットアワー判定
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  template-engine.ts   │  テンプレートでメッセージ生成
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  platform-dispatcher  │  プラットフォーム別に振り分け
│  → slack/discord/...  │  リトライ付き配信 (最大 5 回)
└──────────────────────┘
```

---

## 5. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| NotificationsPage | `/notifications` | 通知設定・Webhook 管理 UI |
