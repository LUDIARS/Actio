---
name: db-schema-docs
description: Schedula の DB スキーマドキュメント (`spec/dblist.md` と `spec/dbs/*.md`) を `src/db/` の Drizzle スキーマから再生成する。スキーマファイル (`src/db/schema.ts`, `src/db/curriculum-schema.ts`, `src/db/pm-schema.ts`) を変更した直後、または DB ドキュメントを更新したい時に使用する。テーブルの追加・変更・削除を検知して `spec/dbs/` を同期する。
---

# DB Schema Docs Skill

`src/db/` 配下の Drizzle スキーマ定義から DB スキーマドキュメントを再生成する。
`/db-schema-docs` スラッシュコマンドと同じ動作をスキルとして提供する。

## いつ使うか

- `src/db/schema.ts`, `src/db/curriculum-schema.ts`, `src/db/pm-schema.ts` のいずれかを変更した直後
- 新しいテーブル/カラム/インデックスを追加した時
- ユーザーが「DB スキーマドキュメントを更新して」と依頼した時
- `spec/dblist.md` が古い、または `spec/dbs/` の内容と乖離している時

## 入出力

### 入力ソース

| ファイル | 内容 |
|---------|------|
| `src/db/schema.ts` | メインスキーマ (認証・グループ・カレンダー・通知・予約 など) |
| `src/db/curriculum-schema.ts` | M1 カリキュラム関連 |
| `src/db/pm-schema.ts` | M2 PM 関連 |

### 出力

| ファイル | 内容 |
|---------|------|
| `spec/dblist.md` | カテゴリ別の全テーブル一覧。各テーブルへリンクを貼る |
| `spec/dbs/<table_name>.md` | 1テーブル/1ファイルの詳細スキーマ |

物理テーブル名 (snake_case, 例: `user_project_roles`) をファイル名にする。
Drizzle の TS export 名 (例: `userProjectRoles`) は使わない。

## 手順

1. **ソースファイル読み込み**
   - 3 つのスキーマファイルを Read で全行読む。
2. **テーブル抽出**
   - `sqliteTable("xxx", { ... }, (table) => [...])` ブロックを順に検出する。
   - 第1引数 (物理テーブル名)、第2引数 (カラム定義)、第3引数 (制約コールバック) を解析。
3. **カラム解析**
   - 物理カラム名 (`text("col_name")` の引数)
   - 型: `text` / `integer` / `real`
   - 修飾子: `{ mode: "boolean" | "timestamp" | "json" }`
   - 制約: `.notNull()`, `.unique()`, `.primaryKey()`, `.references(() => other.col, { onDelete: ... })`, `.default(...)`, `.$defaultFn(...)`, `$type<...>()`
   - 直前の JSDoc (`/** ... */`) があれば説明として採用
4. **インデックス・ユニーク制約解析**
   - 第3引数のコールバック内の `index("name").on(...)`, `unique("name").on(...)` を抽出
5. **モジュール分類**
   - ソースファイル内のセクションコメント (`// ─── M1: Rooms ─` など) からカテゴリを推定
   - 下記のカテゴリリストに沿って分類する
6. **`spec/dbs/<table>.md` の出力**
   - 既存ファイルがあれば Write で上書き、新規なら作成
   - テンプレート (下記) に従う
7. **`spec/dblist.md` の再生成**
   - カテゴリ別にテーブルを列挙
   - 各テーブルから `dbs/<table>.md` へリンクを貼る
   - 末尾の集計表 (カテゴリごとの件数) を再計算
8. **古いファイルの削除**
   - `spec/dbs/` 配下の `.md` ファイルのうち、現スキーマに存在しないテーブルがあれば削除
9. **検証**
   - `spec/dbs/*.md` の数と `spec/dblist.md` の集計合計が一致することを確認

## カテゴリ分類

| カテゴリ | テーブル例 |
|---------|-----------|
| 認証・ユーザー | `users`, `sessions`, `user_profiles`, `user_project_roles`, `api_clients` |
| グループ | `groups`, `group_members`, `group_schedules`, `group_events` |
| カレンダー・プラン | `personal_events`, `plans`, `my_plans`, `integration_settings`, `sync_logs`, `reminders` |
| スマートスケジューラ | `scheduling_tasks`, `scheduling_results` |
| M1: 教室・スケジュール | `rooms`, `schedule_entries`, `reservations` |
| M1: カリキュラム | `departments`, `instructors`, `curricula`, `curriculum_*`, `terms`, `instructor_available_slots` |
| M2: PM | `pm_*` |
| M3: MACHINA (旧) | `machina_*` |
| M5: 通知 | `webhook_*`, `notification*` |
| M6: Voting | `voting_*`, `votes` |
| 休日・運用 | `holidays`, `app_settings` |

新しいカテゴリが必要な場合は適切な分類を追加する。

## 出力テンプレート: `spec/dbs/<table>.md`

```markdown
# <table_name>

> <テーブルの目的を1〜2文で簡潔に説明>

- **ソース**: `src/db/<file>.ts`
- **モジュール**: <カテゴリ>

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `<col>` | <type> | <constraints> | <description> |

## インデックス / ユニーク制約

- PK: `<col>`
- UNIQUE: `(<cols>)` — `<index_name>`
- INDEX: `(<cols>)` — `<index_name>`
- FK: `<col>` → `<other_table>.<col>`
```

### 型表記ルール

| Drizzle 定義 | ドキュメント表記 |
|------------|--------------|
| `text("x")` | `text` |
| `integer("x")` | `integer` |
| `integer("x", { mode: "boolean" })` | `integer (boolean)` |
| `integer("x", { mode: "timestamp" })` | `integer (timestamp)` |
| `text("x", { mode: "json" })` | `text (JSON)` |
| `text("x", { mode: "json" }).$type<string[]>()` | `text (JSON \`string[]\`)` |
| `real("x")` | `real` |

### 制約表記ルール

| Drizzle 定義 | ドキュメント表記 |
|------------|--------------|
| `.primaryKey()` | `PRIMARY KEY` |
| `.notNull()` | `NOT NULL` |
| `.unique()` | `UNIQUE` |
| `.references(() => x.y)` | `FK → x.y` |
| `.references(() => x.y, { onDelete: "cascade" })` | `FK → x.y (ON DELETE CASCADE)` |
| `.default("v")` | `default \`v\`` |
| `.$defaultFn(() => new Date())` | `default \`now()\`` |
| nullable (no `.notNull()`) | `nullable` |

## 注意事項

- ドキュメントのみ更新。マイグレーション生成 (`drizzle-kit generate`) や DB 操作は行わない。
- スキーマ変更後は必ずこのスキルを実行してドキュメントを最新化する。
- 物理名 (snake_case) で統一する。
- JSDoc コメントを元の日本語のまま転記する (要約せず)。
- セクションコメント (例: `// ─── M5: Webhook Endpoints ─`) を手がかりにモジュールカテゴリを推定する。
