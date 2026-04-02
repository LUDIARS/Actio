# 外部サービス連携モジュール計画書

## 概要

Google Calendar 双方向同期と Notion データベース連携を提供するモジュール。外部サービスのデータを Schedula と同期し、統合的なスケジュール管理を実現する。

---

## モジュール構成

```
modules/integrations/
├── PLAN.md                     # 本設計書
├── index.ts                    # ルーター集約
├── google-calendar-sync.ts     # Google Calendar 双方向同期
└── notion.ts                   # Notion Database 連携
```

---

## 1. Google Calendar 同期

### 1.1 機能

- Schedula の personalEvent を Google Calendar に Push
- Google Calendar のイベントを Schedula に Pull
- 変更検知 & 差分同期
- 競合検出 (calendar モジュールの conflicts と連携)

### 1.2 API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/google-calendar/sync` | 手動同期トリガー |
| GET | `/google-calendar/status` | 同期ステータス |
| PUT | `/google-calendar/settings` | 同期設定更新 |

---

## 2. Notion 連携

### 2.1 機能

- Notion Database のページを Schedula タスクとして取得
- PM モジュール (M2) との連携で双方向同期

### 2.2 API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/notion/connect` | Notion 接続 |
| GET | `/notion/databases` | データベース一覧 |
| POST | `/notion/sync` | 同期実行 |

---

## 3. 依存モジュール

| モジュール | 用途 |
|-----------|------|
| calendar | personalEvent の同期対象 |
| pm | Notion タスク同期の連携 |
| secrets | API キー・トークンの管理 |

---

## 4. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| IntegrationsPage | `/integrations` | 外部サービス接続管理 UI |
