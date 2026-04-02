# M1: CALICULA (学校カリキュラム管理) モジュール計画書

## 概要

学校・教育機関向けのカリキュラム管理モジュール。学科・講師・カリキュラムの CRUD、講師の出講可能スロット管理、ターム単位のカリキュラム配置・スワップ、教室管理を提供する。データをグループやプラン形式に自動変換するマイグレーション機能を含む。

---

## モジュール構成

```
modules/schedule/
├── PLAN.md                     # 本設計書
└── routes.ts                   # メイン API ルート (管理者限定)

modules/school/
├── index.ts                    # SchulaModule エクスポート & ルーター統合
└── facility-booking/           # 施設予約サブモジュール (別 PLAN.md)
```

---

## 1. データモデル

### 1.1 学科 (Department)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー (UUID) |
| name | string | 学科名 |

### 1.2 講師 (Instructor)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー (UUID) |
| name | string | 講師名 |

### 1.3 カリキュラム (Curriculum)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー (UUID) |
| name | string | カリキュラム名 |
| departmentId | string | 所属学科 |
| instructorId | string? | 担当講師 (null = 未アサイン) |

### 1.4 出講可能スロット (AvailableSlot)

講師ごとに曜日 × コマの出講可能時間を管理。

### 1.5 ターム (Term)

学期・期間の単位。カリキュラム配置はターム単位で行う。

### 1.6 教室 (Room)

教室の種別 (講義室, 演習室, PC室, 実験室, 大講義室) と容量を管理。

---

## 2. API エンドポイント

全エンドポイントは **管理者権限 (admin)** が必要。

### 2.1 学科 CRUD

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/departments` | 学科一覧 |
| POST | `/departments` | 学科作成 |
| PUT | `/departments/:id` | 学科更新 |
| DELETE | `/departments/:id` | 学科削除 |

### 2.2 講師 CRUD

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/instructors` | 講師一覧 |
| POST | `/instructors` | 講師作成 |
| PUT | `/instructors/:id` | 講師更新 |
| DELETE | `/instructors/:id` | 講師削除 |

### 2.3 カリキュラム CRUD

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/departments/:departmentId/curricula` | 学科別カリキュラム |
| GET | `/curricula` | 全カリキュラム |
| POST | `/departments/:departmentId/curricula` | カリキュラム作成 |
| PUT | `/curricula/:id` | カリキュラム更新 |
| DELETE | `/curricula/:id` | カリキュラム削除 |

### 2.4 出講可能スロット

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/instructors/:instructorId/availability` | 出講可能スロット取得 |
| PUT | `/instructors/:instructorId/availability` | 出講可能スロット更新 |

### 2.5 ターム & 配置

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/terms` | ターム一覧 |
| POST | `/terms` | ターム作成 |
| PUT | `/terms/:id` | ターム更新 |
| DELETE | `/terms/:id` | ターム削除 |
| GET | `/terms/:termId/placements` | 配置一覧 |
| PUT | `/terms/:termId/placements` | 配置更新 |
| POST | `/terms/:termId/placements/swap` | スロットスワップ |
| POST | `/terms/:termId/decide` | 配置確定 |

### 2.6 教室

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/rooms` | 教室一覧 |
| POST | `/rooms` | 教室作成 |
| PUT | `/rooms/:id` | 教室更新 |
| DELETE | `/rooms/:id` | 教室削除 |

### 2.7 マイグレーション & エクスポート

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/export` | データエクスポート |
| POST | `/import` | データインポート |
| GET | `/migration/status` | マイグレーション状態 |
| POST | `/migration/departments-to-groups` | 学科→グループ自動登録 |
| POST | `/migration/schedule-to-plans` | 配置→プラン自動変換 |

---

## 3. マイグレーション機能

### 3.1 学科→グループ変換

登録済みの学科を Schedula のグループとして一括登録する。学科名がグループ名になり、管理者がオーナーとして設定される。

### 3.2 配置→プラン変換

カリキュラム配置データを `groupSchedules` 形式に変換し、グループの繰り返し予定として登録する。既存の配置ラベルを持つスケジュールは削除してから再生成する。

---

## 4. 依存モジュール

| モジュール | 用途 |
|-----------|------|
| holiday | 休日・休業期間を考慮した配置 (getBlockedDates, getClassDays) |
| group | マイグレーション先のグループ管理 |
| notification | 配置確定時の通知 |

---

## 5. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| DataManagementPage | `/data` | 学科・講師・カリキュラム CRUD |
| SchemaManagementPage | `/schema` | ターム・配置管理 |
