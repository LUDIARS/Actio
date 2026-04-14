---
description: spec/dblist.md と spec/dbs/*.md を src/db/ の最新スキーマから再生成する
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /db-schema-docs — DB スキーマドキュメント再生成

`src/db/` 配下の Drizzle スキーマ定義から `spec/dblist.md` および
`spec/dbs/*.md` を再生成する。

## 入力ソース

- `src/db/schema.ts` — メインスキーマ (認証・グループ・カレンダー・通知・予約 など)
- `src/db/curriculum-schema.ts` — M1 カリキュラム関連
- `src/db/pm-schema.ts` — M2 PM 関連

## 出力

- `spec/dblist.md` — 全テーブル一覧 (カテゴリ別)。各テーブルから `dbs/<table>.md` へリンク。
- `spec/dbs/<table_name>.md` — テーブルごとのスキーマ詳細 (1ファイル/テーブル)。
  - 物理テーブル名 (例: `user_project_roles`) をファイル名にする (Drizzle の export 名ではない)。

## 手順

1. **スキーマファイルを全件読む**
   - `src/db/schema.ts`, `src/db/curriculum-schema.ts`, `src/db/pm-schema.ts` を Read で全行読む。
   - `sqliteTable("...", {...}, (table) => [...])` のブロックを順に抽出する。
2. **各テーブルから情報を抽出**
   - 物理テーブル名 (`sqliteTable("xxx", ...)` の第1引数)
   - カラム: 物理名、型 (`text` / `integer` / `real`)、`{ mode: "boolean" | "timestamp" | "json" }` 等のモディファイア、`.notNull()`、`.unique()`、`.primaryKey()`、`.references(() => other.col, { onDelete: ... })`、`.default(...)` / `.$defaultFn(...)`、`$type<...>()` の TS 型
   - 第3引数のコールバックから `index(...)`, `unique(...)` 制約 (名前と対象カラム)
   - JSDoc コメント (`/** ... */`) はカラムの説明にそのまま使う
3. **`spec/dbs/<table>.md` を出力**
   - 既存ファイルがあれば `Write` で上書き、新規なら作成
   - フォーマットは下記テンプレートに従う (表示名、ソース、モジュール、カラム表、インデックス表、関連)
   - モジュール分類はソースのコメントセクション (`// ─── M1: Rooms ─` 等) から推測する
4. **`spec/dblist.md` を再生成**
   - カテゴリ別にテーブルを列挙し、各テーブルから `dbs/<table>.md` にリンクを貼る
   - カテゴリは下記の分類に沿う
5. **古いファイルの削除**
   - `spec/dbs/*.md` のうち、現在のスキーマに存在しないテーブルがあれば削除する
6. **テーブル数集計の更新**
   - `dblist.md` の最後の集計表 (カテゴリごとの件数) を再計算する

## カテゴリ分類

| カテゴリ | 含まれるテーブル名パターン |
|---------|--------------------------|
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

新規テーブルが既存カテゴリに当てはまらない場合は、適切な新カテゴリを追加する。

## テーブルファイルのテンプレート (`spec/dbs/<table>.md`)

```markdown
# <table_name>

> <テーブルの目的を1〜2文で簡潔に説明 (元コメントから抽出)>

- **ソース**: `src/db/<file>.ts`
- **モジュール**: <カテゴリ名>

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `<col>` | <type> | <constraints> | <description> |
...

## インデックス / ユニーク制約

- PK: `<col>`
- UNIQUE: `(<cols>)` — `<index_name>`
- INDEX: `(<cols>)` — `<index_name>`
- FK: `<col>` → `<table>.<col>`
```

カラム表のルール:
- 物理カラム名 (snake_case)
- 型は `text` / `integer` / `real` で表記。修飾子 (`mode: "boolean" | "timestamp" | "json"`) は `(boolean)` `(timestamp)` `(JSON)` のように添える
- JSON カラムで `$type<X[]>()` がある場合は `text (JSON \`X[]\`)` とする
- 制約は `PRIMARY KEY` / `NOT NULL` / `UNIQUE` / `FK → table.col` / `default <値>` の組み合わせで簡潔に
- 説明は元 JSDoc から日本語でそのまま使う (なければ簡単に補完)

## 注意

- 物理テーブル名 (snake_case) でファイル名と表示を統一する。Drizzle の TS export 名 (`userProjectRoles` 等) はファイル名に使わない。
- スキーマ変更時は **必ずこのコマンドを再実行する**。さもなくば `spec/dblist.md` が古くなる。
- このコマンドはドキュメントのみ更新する。マイグレーション生成 (`drizzle-kit generate`) や DB 操作はしない。
- 完了後、`spec/dbs/` 配下のファイル数と `spec/dblist.md` の集計が一致することを確認する。
