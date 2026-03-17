# M1 スキーマ仕様書

## 概要

M1 (カリキュラムモジュール) は、教育機関向けの時間割管理の基盤データを管理するモジュールです。
学科・講師・カリキュラム・出講可能スロットの4つのエンティティで構成されます。

## データモデル

### エンティティ関係図

```
departments (学科)
    │
    ├─── curricula (カリキュラム) ──── instructors (講師)
    │      N:1 department              N:1 instructor (nullable)
    │
    └─── [scheduleEntries]            instructors
              配置結果                      │
                                           └─── instructor_available_slots (出講可能スロット)
                                                  N:1 instructor
```

### 階層構造

```
学科 (Department)
  例: "情報工学科", "デザイン学科"
    ├── カリキュラム A (Curriculum)
    │     例: "プログラミング基礎"
    │     └── 担当講師: 田中先生 (Instructor)
    │           └── 出講可能: 月[1,2,3], 水[2,3,4]
    └── カリキュラム B
          例: "アルゴリズム"
          └── 担当講師: 佐藤先生
                └── 出講可能: 火[1,2], 木[3,4,5]
```

---

## テーブル定義

### 1. departments (学科)

トップレイヤの設定項目。カリキュラムは学科の下にぶら下がる。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | 学科名 |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT now() | 作成日時 |

**ファイル**: `src/db/curriculum-schema.ts` (L26-33)

### 2. instructors (講師)

トップレイヤの設定項目。複数のカリキュラムを担当可能。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | 講師名 |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT now() | 作成日時 |

**ファイル**: `src/db/curriculum-schema.ts` (L38-45)

### 3. curricula (カリキュラム)

学科の下に複数存在。1つの学科 × 1人の講師。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | カリキュラム名 |
| `department_id` | TEXT | NOT NULL, FK → departments.id | 所属学科ID |
| `instructor_id` | TEXT | FK → instructors.id, NULLABLE | 担当講師ID (未アサイン状態を許容) |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT now() | 作成日時 |

**インデックス**:
- `idx_curricula_department` ON (department_id)
- `idx_curricula_instructor` ON (instructor_id)

**ファイル**: `src/db/curriculum-schema.ts` (L50-71)

### 4. instructor_available_slots (出講可能スロット)

講師ごとに「どの曜日の何コマ目に出講可能か」を管理。1行 = 1つの曜日 × 複数のコマ番号。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `instructor_id` | TEXT | NOT NULL, FK → instructors.id | 講師ID |
| `day` | INTEGER | NOT NULL | 曜日 (0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日) |
| `periods` | TEXT (JSON) | NOT NULL | 出講可能なコマ番号の配列 例: [1,2,3] |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT now() | 作成日時 |

**インデックス**:
- `idx_available_slots_instructor` ON (instructor_id)

**ファイル**: `src/db/curriculum-schema.ts` (L77-101)

### 5. schedule_entries (スケジュールエントリ / 時間割配置結果)

カリキュラムの配置結果を管理。メインスキーマ (`src/db/schema.ts`) に定義。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `day` | INTEGER | NOT NULL | 曜日 (0-6) |
| `period` | INTEGER | NOT NULL | コマ (0-10) |
| `curriculum_id` | TEXT | NOT NULL | カリキュラムID |
| `room_id` | TEXT | FK → rooms.id, NULLABLE | 教室ID |
| `instructor_id` | TEXT | NOT NULL | 講師ID |
| `candidate_count` | INTEGER | NOT NULL, DEFAULT 0 | 配置候補数 |
| `is_confirmed` | BOOLEAN | NOT NULL, DEFAULT false | 確定済みか |
| `term_id` | TEXT | NOT NULL | 学期ID |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT now() | 作成日時 |

**ユニーク制約**: `unique_slot_per_room` ON (day, period, room_id, term_id)

**ファイル**: `src/db/schema.ts` (L64-85)

### 6. rooms (教室)

教室の定義。メインスキーマに定義。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | 教室名 |
| `capacity` | INTEGER | NOT NULL | 定員 |
| `type` | TEXT | NOT NULL | 教室タイプ |
| `equipment` | TEXT (JSON) | NOT NULL, DEFAULT [] | 設備リスト |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT now() | 作成日時 |

**ファイル**: `src/db/schema.ts` (L49-59)

---

## 時間モデル

| 項目 | 値 |
|------|-----|
| 曜日 | 7日間 (0=月曜 〜 6=日曜) |
| コマ数 | 11コマ (0限 〜 10限) |
| 1コマの長さ | 60分 |
| 開始時刻 | 9:30 |
| 時間割 | 0限=9:30-10:30, 1限=10:30-11:30, ..., 10限=19:30-20:30 |

---

## API エンドポイント

### 学科 (Departments)

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/m1/departments` | 学科一覧取得 |
| POST | `/api/m1/departments` | 学科作成 (body: `{ name }`) |
| PUT | `/api/m1/departments/:id` | 学科更新 (body: `{ name }`) |
| DELETE | `/api/m1/departments/:id` | 学科削除 |

### 講師 (Instructors)

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/m1/instructors` | 講師一覧取得 |
| POST | `/api/m1/instructors` | 講師作成 (body: `{ name }`) |
| PUT | `/api/m1/instructors/:id` | 講師更新 (body: `{ name }`) |
| DELETE | `/api/m1/instructors/:id` | 講師削除 |

### カリキュラム (Curricula)

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/m1/curricula` | カリキュラム全件取得 |
| GET | `/api/m1/departments/:departmentId/curricula` | 学科別カリキュラム取得 |
| POST | `/api/m1/departments/:departmentId/curricula` | カリキュラム作成 (body: `{ name, instructorId? }`) |
| PUT | `/api/m1/curricula/:id` | カリキュラム更新 (body: `{ name?, instructorId? }`) |
| DELETE | `/api/m1/curricula/:id` | カリキュラム削除 |

### 出講可能スロット (Instructor Available Slots)

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/m1/instructors/:instructorId/availability` | 講師の出講可能スロット取得 |
| PUT | `/api/m1/instructors/:instructorId/availability` | 一括設定 (body: `{ slots: [{ day, periods }] }`) |

---

## UI ページ

### M1 スキーマ管理 (`/schema-management`)

データベースの直接操作ページ。4つのタブで構成:

1. **学科タブ**: 学科のCRUD操作
2. **講師タブ**: 講師のCRUD操作
3. **カリキュラムタブ**: カリキュラムのCRUD (学科フィルタ、講師アサイン対応)
4. **出講可能スロットタブ**: 7×11のグリッドで講師の出講可能時間を視覚的に管理

### M1 データ管理 (`/data-management`)

カリキュラムを時間割グリッドに配置するページ:

1. **配置タブ**: M1スキーマのカリキュラムを選択して曜日×時限に配置
2. **一覧・スワップタブ**: 配置済みエントリの閲覧・入れ替え操作

---

## 設計原則

1. **学科・講師はトップレイヤ**: 独立したマスタデータとして管理
2. **カリキュラムは学科に従属**: `department_id` は必須、`instructor_id` は任意
3. **出講可能スロットは講師に従属**: 曜日ごとに出講可能なコマ番号のリストを管理
4. **時間割配置は別レイヤ**: `schedule_entries` テーブルで実際の配置結果を管理
5. **UUID採用**: 全テーブルでテキスト型UUIDを主キーに使用
