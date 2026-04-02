# リマインダーモジュール計画書

## 概要

構造化タスクリマインダーを管理するコアモジュール。自然言語パーサーによるリマインダー作成と、繰り返しルール (日次/週次/月次/年次) をサポート。Alexa 連携拡張も含む。

---

## モジュール構成

```
modules/reminder/
├── PLAN.md                     # 本設計書
├── routes.ts                   # リマインダー API ルート
├── text-parser.ts              # 自然言語テキスト解析
└── extensions/
    └── alexa/
        └── routes.ts           # Alexa スキル連携
```

---

## 1. データモデル

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー |
| userId | string | 所有ユーザ |
| title | string | リマインダー名 |
| description | string? | 説明 |
| remindAt | string | リマインド日時 (ISO 8601) |
| repeatRule | string | none / daily / weekly / monthly / yearly |
| status | string | pending / done / cancelled |
| source | string | api / parser |

---

## 2. API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/` | リマインダー一覧 (status フィルタ可) |
| POST | `/` | リマインダー作成 (構造化) |
| POST | `/parse` | 自然言語テキストからリマインダー生成 |
| PUT | `/:id` | リマインダー更新 |
| DELETE | `/:id` | リマインダー削除 |
| PATCH | `/:id/done` | 完了マーク |

### Alexa 拡張

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/alexa/intent` | Alexa スキルからのリマインダー操作 |

---

## 3. テキストパーサー

自然言語からリマインダー情報を抽出:

```
"明日の10時にレポート提出" → { title: "レポート提出", remindAt: "2026-04-03T10:00:00" }
"毎週月曜の朝に週報作成" → { title: "週報作成", remindAt: "...", repeatRule: "weekly" }
```

---

## 4. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| ReminderPage | `/reminders` | リマインダー管理 UI |
