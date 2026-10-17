# タスク一覧 API (GET /api/tasks) — 要約・ページ分け・絞り込み

**Requirement ID: `AT-TASK-LIST-PAGING`**

Actio タスク参照: `actio:997f4c67-a851-46da-8753-d5f77bc535bb`。

> 2026-10-17 neco 指示: 「全ての Web/API で応答 1 秒超は不具合」。一覧は要約だけ返す + ページネーション + フィルター。

## 1. 背景

絞り込みなしの `GET /api/tasks` (ローカルモード、owner=actio-local) が全件 21.8MB を返し、5〜14 秒かかっていた。
主な原因は、AI 委託タスクの `description` に依頼文の全文が入っていること。一覧の応答から本文を外し、件数をページで区切る。

## 2. 応答

```json
{ "tasks": TaskSummary[], "nextCursor": "<不透明文字列>" | null }
```

- `TaskSummary` は既存の Task から `description` / `requirements` / `completionEvidence` / `publicSummary` を除いたもの。
  `pluginPayload` は残す (Cc taskflow が runs を読む)。全文は `GET /api/tasks/:id` で取る。
- `include=description` を明示したときだけ `description` を含める (移行ツールなどの明示 opt-in)。ページ分けはこのときも効く。
  他の値は 400。
- 本文の列は DB からも読まない (`src/db/task-list-page-repository.ts`)。

## 3. ページ分け (キーセット)

- `limit`: 既定 100、上限 500。1〜500 の整数以外は 400。
- `cursor`: 前ページの `nextCursor` をそのまま渡す。中身は不透明 (前ページ最後の行の並びキーと並び順を base64url の JSON にしたもの、
  `modules/task/list/cursor.ts`)。壊れた値・別の並び順 (`sort`) のカーソルは 400。
- 最終ページは `nextCursor: null`。offset は使わない。
- 並び順 (`src/db/task-list-keyset.ts`)。どちらも最後に `id` を置いて全順序にし、同じ時刻の行があっても重複・抜けが出ないようにする。
  - 既定: `updated_at desc, id desc`
  - `sort=personal`: 状態の順 (未着手 → 進行中 → 完了 → その他) asc、期限 asc (期限なしは最後)、`created_at desc`、`id desc`
- 消費側は `nextCursor` が無い (旧 Actio) か null なら最終ページとみなす。

## 4. 絞り込み

既存の `scope` / `groupId` / `project` / `team_id` / `status` / `kind` / `pluginId` / `lane` / `sprint_id` / `executor_type` /
`dueBefore` / `sort` / `view` はそのまま使える。次を追加する。不正な値は 400。

| パラメタ | 意味 |
|---|---|
| `q` | title の部分一致 (大文字小文字を区別しない。`%` `_` は文字として扱う) |
| `status` | カンマ区切りで複数指定 (いずれかに一致)。`todo` / `doing` の別名も受ける。知らない値が 1 つでもあれば 400 |
| `category` | カンマ区切りの `category` のどれか 1 つと完全一致 (前後の空白は無視) |
| `assignee` | 担当者のユーザ ID と一致 (`scope=assigned` とは独立に指定できる) |
| `updated_since` | ISO 8601。`updated_at >= updated_since` |
| `due_after` | ISO 8601。`deadline >= due_after` |

条件は `src/db/task-list-conditions.ts` に集約し、全件取得の `taskRepo.list` と同じ条件を使う。

## 5. format=memoria と view=current_sprint

- `format=memoria` も要約を返す (`{ items, nextCursor }`)。`details` は `include=description` のときだけ値が入り、無ければ null。
  ページ分けも同じ。
- `view=current_sprint` は従来どおり、ページ分けの対象外 (全件の Task を返す)。追加した絞り込みは効く。

## 6. キャッシュ

`taskListCache` のキーには、絞り込み・並び順・`limit`・`cursor`・`include` をすべて含める。タスクを書き込むと世代が進み、
古いページは返らない (`modules/task/cache/task-list-cache.ts`)。

## 7. 索引

キーセットの先頭ページを索引だけで引けるよう、次の索引を加える (`src/db/task-list-indexes.ts`。MySQL は Drizzle 定義側)。

- `idx_task_owner_updated (owner_id, updated_at, id)` — `scope=owned`
- `idx_task_assignee_updated (assignee_id, updated_at, id)` — `scope=assigned`
- `idx_task_team_updated (team_id, updated_at, id)` — `team_id=`
- `idx_task_updated (updated_at, id)` — `scope=all`

## 8. 受け入れ

- 1 万件 (1 件あたり約 6KB の本文) の合成データで、既定の呼び出しが 1 秒未満、100 件、応答 200KB 未満であること
  (`tests/api/task-list-page.test.ts`)。
- 契約 C-18〜C-21 (`augur.contracts.json`): クエリ解析・カーソル・要約・ページ組み立て。

## 9. 消費側

- Actio 内: タスク画面 (`frontend/src/pages/TasksPage.tsx`) は要約を 100 件ずつ表示し、「さらに読み込む」で続きを読む。
  説明・要件は「詳細」を開いたときに `GET /api/tasks/:id` で取る。編集時も全文を取り直してからフォームに入れる。
  検索 (q)・状態・カテゴリ・担当で絞り込める。`scripts/cc-project-backfill.ts` は `nextCursor` を辿って全件を読む。
- Concordia (先に反映): `src/taskflow/actio-task-client.ts`・`src/fallback-tasks/actio-client.ts`・
  `src/developer-tools/actio-sync-migration/sources.ts` が旧形式 (description あり・nextCursor なし) と新形式の両方に対応する。
- 反映順: 1) Concordia の消費側 → 2) Actio の新しい契約。
