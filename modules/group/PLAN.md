# グループモジュール計画書

## 概要

Actio の中核モジュール。ユーザをグループ (チーム・学科・プロジェクト等) に組織化し、グループ単位での予定管理・モジュール選択を提供する。ロールベースの権限管理 (owner/leader/member) を備える。

---

## モジュール構成

```
modules/group/
├── PLAN.md                     # 本設計書
└── routes.ts                   # グループ API ルート
```

---

## 1. データモデル

### 1.1 グループ (groups)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー (UUID) |
| name | string | グループ名 |
| description | string? | 説明 |
| enabledModules | string? | 有効モジュール (JSON 配列) |
| createdBy | string | 作成者 |
| createdAt | timestamp | 作成日時 |

### 1.2 グループメンバー (groupMembers)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー |
| groupId | string | グループ FK |
| userId | string | ユーザ FK |
| role | string | owner / leader / member |
| joinedAt | timestamp | 参加日時 |

### 1.3 グループ予定 (groupSchedules)

曜日 × ピリオドの繰り返し予定。`scheduleType` で recurring / oneshot を区別。

### 1.4 グループ個別予定 (groupEvents)

日付ベースの行事・休日・審査会期間。`eventType` で event / holiday / examination_period / custom を区別。

---

## 2. 権限モデル

```
システム管理者 (admin)    → 全グループ管理可
グループオーナー (owner)  → そのグループの全操作
リーダー (leader)          → メンバー招待・予定管理
一般メンバー (member)      → 閲覧・自身の脱退のみ
```

---

## 3. API エンドポイント

### 3.1 グループ基本操作

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/my` | 自分の所属グループ一覧 |
| GET | `/:id` | グループ詳細 (メンバー・予定含む) |
| POST | `/` | グループ作成 (作成者がオーナーに) |
| POST | `/:id/join` | グループ参加 |
| POST | `/:id/leave` | グループ脱退 |

### 3.2 メンバー管理

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/:id/invite` | メンバー招待 |
| PUT | `/:id/members/:memberId/role` | ロール変更 |
| GET | `/users/search` | 招待用ユーザ検索 |

### 3.3 予定管理

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/:id/schedules` | 繰り返し予定追加 |
| GET | `/:id/events` | 個別予定一覧 |
| POST | `/:id/events` | 個別予定追加 |
| PUT | `/:id/events/:eventId` | 個別予定更新 |
| DELETE | `/:id/events/:eventId` | 個別予定削除 |

### 3.4 モジュール設定

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/:id/modules` | 有効モジュール取得 |
| PUT | `/:id/modules` | 有効モジュール更新 (owner/leader のみ) |

---

## 4. モジュール選択機能

グループごとに使用するモジュールを選択できる。`enabledModules` フィールドに JSON 配列として保存。

**選択可能モジュール:**

| ID | 名称 | カテゴリ |
|----|------|----------|
| calicula | CALICULA (M1) | 教育 |
| pm | PM (M2) | プロジェクト |
| machina | MACHINA (M3) | プロジェクト |
| notification | 通知・Webhook | コミュニケーション |
| voting | 日程調整Voting | コミュニケーション |
| holiday | 休日管理 | ユーティリティ |
| facility-booking | 施設予約 | 教育 |
| integrations | 外部サービス連携 | ユーティリティ |

**コアモジュール (常時有効):** auth, groups, calendar, myplan, smart-scheduler, reminders, profile

---

## 5. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| GroupsPage | `/groups` | グループ管理・モジュール設定 UI |
