# タスク一覧 API (GET /api/tasks) — 要約・ページ分け・絞り込み

**Requirement ID: `AT-TASK-LIST-PAGING`**

**Requirement ID: `AT-TASK-LIST-STALL`**

Actio タスク参照: `actio:997f4c67-a851-46da-8753-d5f77bc535bb`（ページ分け）、`actio:79cf41e0-aff0-4960-8a87-7500633ff325`（ページ読みの停止）。

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
- 並び順 (`src/db/task-list-keyset.ts`)。いずれも最後に `id` を置いて全順序にし、同じ時刻の行があっても重複・抜けが出ないようにする。
  - 既定: `updated_at desc, id desc`
  - `sort=personal`: 状態の順 (未着手 → 進行中 → 完了 → その他) asc、期限 asc (期限なしは最後)、`created_at desc`、`id desc`
  - `sort=priority`: 最優先 → 高 → 中 → 低、同順位は `id asc`。ダッシュボードは閲覧可能な未完了タスクをこの順で表示する。
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

キャッシュにページが無い場合は同一キーの要求で 1 回の生成を共有する。生成は 8 秒で期限切れとし、そのキーの保留を解除する。
同じキーは次の要求で再生成でき、期限切れになった生成が後から成功してもキャッシュに書き込まない。
キャッシュ側の最大 2 回の読み込みはそれぞれ 200 ms が上限で、Concordia の 10 秒の待機枠に収まるようにする。

## 7. 索引

キーセットの先頭ページを索引だけで引けるよう、次の索引を加える (`src/db/task-list-indexes.ts`。MySQL は Drizzle 定義側)。

- `idx_task_owner_updated (owner_id, updated_at, id)` — `scope=owned`
- `idx_task_assignee_updated (assignee_id, updated_at, id)` — `scope=assigned`
- `idx_task_team_updated (team_id, updated_at, id)` — `team_id=`
- `idx_task_updated (updated_at, id)` — `scope=all`

PostgreSQL の既定順の続きは `(updated_at, id) < (cursor.updated_at, cursor.id)` で絞り込む。
これにより既存の複合索引で続きの境界から走査できる。降順の並びとカーソル形式は従来どおり。

## 8. 受け入れ

- 1 万件 (1 件あたり約 6KB の本文) の合成データで、既定の呼び出しが 1 秒未満、100 件、応答 200KB 未満であること
  (`tests/api/task-list-page.test.ts`)。
- 契約 C-18、C-19、C-21、C-27 (`augur.contracts.json`) でクエリ解析、カーソル、ページ組み立て、ページ単位の要約を確認する。
- 生成が止まった場合は同じキーの待機要求すべてが期限切れになり、次の要求は同じキーを読み直せる。遅れて完了した生成でキャッシュは上書きされない。
- PostgreSQL のクエリ中断および生成の期限切れは 503 の JSON `{"error":"Task list temporarily unavailable"}` を返す。
- 契約 C-25〜C-26 (`augur.contracts.json`): 一覧のタイムアウト応答と PostgreSQL 接続設定。

## 9. 消費側

- Actio 内: タスク画面 (`frontend/src/pages/TasksPage.tsx`) は要約を 100 件ずつ表示し、「さらに読み込む」で続きを読む。
  説明・要件は「詳細」を開いたときに `GET /api/tasks/:id` で取る。編集時も全文を取り直してからフォームに入れる。
  検索 (q)・状態・カテゴリ・担当で絞り込める。`scripts/cc-project-backfill.ts` は `nextCursor` を辿って全件を読む。
- Concordia (先に反映): `src/taskflow/actio-task-client.ts`・`src/fallback-tasks/actio-client.ts`・
  `src/developer-tools/actio-sync-migration/sources.ts` が旧形式 (description あり・nextCursor なし) と新形式の両方に対応する。
- 反映順: 1) Concordia の消費側 → 2) Actio の新しい契約。

## 10. ページ読みの停止と計測

2026-11-25 に、500 件ずつ実際の `nextCursor` をたどると、親セッションの 3 回の試行すべてで 1〜5 ページ目のいずれかが 20 秒以上停止した。
Concordia は 10 秒で待機を打ち切るため、一覧取得に依存する操作も失敗した。期限のないキャッシュ生成は同じキーの後続要求にも停止を広げていた。
対策 #4219 の反映後も、同日 16:30〜16:50 JST の計測では 19〜25 秒の停止が続いた。同時に `/api/health/live` も最大 9.3 秒待たされ、26 秒間の CPU 使用は 0.9 秒だった。
`toTaskSummary` の契約 C-20 が 1 行ごとに共有 `contracts.jsonl` へ同期追記し、500 件のページでは 500 回の同期 I/O がイベントループを占有していた。
共有ファイルは他サービスの追記で更新日が進み続けるため、mtime による日替わり判定が機能せず、計測時点で 79 MB に達していた。

キャッシュミスではページの取得待ち (`phase=db_wait`、プール・通信・行デコードを含む) と、要約から JSON 化まで (`phase=format`) を別々に計測する。
段階が 500 ms 以上かかった時と、キャッシュ生成が期限切れになった時に警告を出す。DB 待ちの途中で期限切れになった場合も `phase=db_wait state=deadline` を記録する。
警告にはカーソルやタスク本文を含めない。
PostgreSQL 接続は `statement_timeout=7000` と TCP keepalive の初回プローブまでのアイドル時間 15 秒を設定する。
文の期限は PostgreSQL に到達してから適用される。プール待ちや通信断で DB が応答しない場合もキャッシュ生成側の期限で待機を解除する。
同期の整形処理がイベントループを占有するとタイマーの実行も遅れるため、整形の警告で判別する。

## 11. 契約ログの非同期化

一覧の要約は `summarizeTaskList` のページ単位で観測する。行単位の `toTaskSummary` は Augur の契約定義から外し、一覧の応答形式を維持する。
契約ログはプロセス内に最大 4,096 件を保留し、128 件に達するか最初の保留から 250 ms 経過すると、別のイベントループの処理で最大 128 件ずつ非同期追記する。
通常終了とサーバーの終了処理では残りを flush する。書き込み失敗や保留枠を超えた観測は破棄し、API の結果には影響させない。

書き込み開始時点の JST 日付を用い、`VESTIGIUM_LOGS_DIR`（既定は `logs/`）の直下に `contracts-actio-YYYY-MM-DD-<プロセス固有 ID>.jsonl` を作る。
Augur はこの JSONL を既存の形式のまま集計できる。日付が切り替わった最初の書き込みで `AUGUR_CONTRACT_LOG_RETENTION_DAYS`（既定 7 日）の範囲を過ぎた Actio の日別ファイルを削除する。
既存の共有 `contracts.jsonl` は親セッションが扱う。Augur の旧テンプレートに由来する同期追記と mtime 判定は、同じ版を利用する他サービスにも残り得る。

回帰テストはページ単位の観測、件数と時間による書き込み、終了時 flush、書き込みエラーの分離、JST 日付の切り替えと保持期間を確認する。委託の実行範囲に従い、テスト実行とサービス再現は未実施。
