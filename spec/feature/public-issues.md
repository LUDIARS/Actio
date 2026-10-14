# パブリックイシュー

**Requirement ID: `AT-PUBLIC-ISSUES`**

設計正本: Concordia `spec/feature/bug-bounty.md` §8 (`SPEC-BOUNTY-PUBLIC`)。タスク: Concordia
`spec/tasks/2026-10-02-bounty-public.md` の「完了条件 (Actio)」。Actio タスク参照: `actio:bc4fc281-87ee-4efa-adef-4aaa041a5b06`。

> 2026-10-02 neco 指示:「プロジェクトが public のものは Actio の認証なしオープンな領域で報告者と合わせて確認できる」
> 「Actio のバグバウンティのバグは『パブリックイシュー』とし、他のバウンティがない公開物も見れるようにする」
> 「正確にはバグ等のイシュー的なタスク」。

## 1. 目的

公開プロジェクトのイシューを、認証なしで誰でも見られるようにする。原文・非公開プロジェクト・反映前の機微な報告・
担当者・作成者は出さない。

## 2. タスクの種別 `issue`

- `tasks.kind` に `issue` を足す (既存は `task` / `goal`)。バグ・不具合・改善要望などのイシュー的なタスク。
  作成 (`POST /api/tasks`)・更新 (`PUT/PATCH /api/tasks/:id`)・一覧の `kind` 絞り込みと、タスク画面で選べる。
- `tasks.public_hidden` (真偽、既定 false): パブリックイシューに出さない。
- `tasks.public_summary` (文字列、任意、1000 文字まで): 公開用の要約。本文 (`description` / `requirements`) の代わりに出す。
  空文字は null として保存する。
- 移行: `issue` 導入前に通常のバグ報告 (Castra のスキル `bug-report`) が作ったタスク
  (`kind = 'task'`・`source = 'cc-command'`・`source_ref LIKE 'bug:%'`) を起動時の migration で `issue` へ移す
  (`src/db/issue-kind-migration.ts`)。それ以外のタスクは触らない。
- `POST /api/tasks` は `source: "concordia.bounty.v1"` を受ける。既存の source / sourceRef の一意制約と、
  重複時の所有の検査 (`canReturnIdempotentTask`) はそのまま。

## 3. 並べるものと公開する項目

公開プロジェクトごとに 2 つの欄を並べる。

| 欄 | 出どころ | 公開する項目 |
|---|---|---|
| バウンティのイシュー | Cc `GET /v1/bounty/public-reports?project=<code>` | 公開用の題名と要約、深刻度、状態 (対応する Actio タスクがあればその状態)、報告者の公開名、報奨のトークン数、受付と反映の時刻、報告 id |
| イシュー | 公開プロジェクトの `kind = 'issue'` で `public_hidden` でないタスク (`tasks.project_id` = プロジェクトコード) | 題名、公開用の要約、状態、優先度、作成と完了の時刻、タスク id |

- `source: concordia.bounty.v1` のタスクはバウンティの行にまとめ (報告 id = `sourceRef` で突き合わせる)、
  イシューの欄には並べない。
- タスクの本文・要件・担当者・作成者・source/sourceRef は出さない。公開形は `modules/public-issues/types.ts` に固定し、
  `toPublicTaskIssue` (契約 C-15) とテストで固定する。
- Cc の応答に原文・受付口・プラットフォームの id・判定の内部理由が混ざっていても、`parsePublicReports` が
  許可した項目だけを拾う (契約 C-14)。

## 4. 経路と境界

- `GET /api/public/issues` (JSON) と `/public/issues` (ページ、actio-web の SPA)。`?project=<code>` で 1 プロジェクトに絞る。
- `project` は Cc のプロジェクトコードの形式 (`^[A-Za-z0-9._-]{1,64}$`) で検証し、外れたら 400。公開一覧に無いコードは
  空の一覧を返す (非公開プロジェクトの存在を区別しない)。
- API はローカルモードの境界 (`localModeBoundary`) の外に置く。外に出すのは `GET` / `HEAD` の `/api/public/issues`
  だけ (`isPublicReadRequest`、契約 C-13)。ルートは `userContext` より前に登録し、認証を読まない。他のメソッドは 405。
- ページは `RequireAuth` と初回設定の確認の外で描画する (`isPublicPath`)。ログイン情報は送らない (`credentials: "omit"`)。
- 外から到達させるための Cloudflare Access の除外設定は本機能に含めない (Cloudflare 側の運用作業。neco の実行が必要)。

## 5. Cc の読み出しとキャッシュ

- 公開プロジェクトかどうかは Cc `GET /v1/projects/public-issues` で決める (正本は Cc の `project_codes.public_issues`)。
- Cc から読んだ内容は成功したものだけを 60 秒までメモリに持ち (`modules/public-issues/ttl-cache.ts`)、DB には保存しない。
  期限を過ぎた値は返さない。
- 公開プロジェクトの一覧が取れないとき (未設定・不達・HTTP エラー・形が違う) は何も出さない (`{ projects: [] }`)。
- バウンティの報告が取れないときは、その欄を `{ available: false }` とし、画面は「取得できません」と出す。
  イシューの欄は Actio の DB から出す。

### 5.1 前提としている Cc の応答形 (未確定)

Cc 側の API は別の委託で実装中のため、次の形を前提にし、許可した項目だけを読む。Cc の実装で名前が変わったら
`modules/public-issues/cc-public-parse.ts` を合わせる。

- `GET /v1/projects/public-issues` → `{ "projects": ["At", ...] }` (要素は `{ "code": "At" }` でもよい。`codes` キーも可)
- `GET /v1/bounty/public-reports?project=<code>` → `{ "reports": [{ "id", "public_title", "public_summary", "severity",
  "status", "public_name", "reward_tokens", "received_at", "deployed_at" }] }` (`id` は `report_id` でもよい)

## 6. 実装の配置

| 責務 | ファイル |
|---|---|
| 公開形の型 | `modules/public-issues/types.ts` |
| Cc 応答の項目の絞り込み | `modules/public-issues/cc-public-parse.ts` |
| Cc クライアント (60 秒キャッシュ) | `modules/public-issues/cc-public-client.ts`, `ttl-cache.ts` |
| 行の組み立て (純関数) | `modules/public-issues/public-view.ts` |
| 一覧の組み立て | `modules/public-issues/service.ts` |
| ルート | `modules/public-issues/routes.ts` (`src/app.ts` で `/api/public`) |
| 境界の例外 | `src/auth/local-mode-policy.ts` `isPublicReadRequest` |
| 公開設定の入力検証 | `modules/task/validation/public-issue-fields.ts` |
| 画面 | `frontend/src/pages/PublicIssuesPage.tsx`, `frontend/src/lib/public-issues-*.ts`、タスク画面の種別・公開設定 |

## 7. Castra 側に必要な変更 (本リポの範囲外)

Castra のスキル `bug-report` は今 `kind: "task"`・category `不具合`・source `cc-command`・sourceRef `bug:<client_key>`
でタスクを作る。`issue` 導入後は `kind: "issue"` で作るよう直す (Castra は direct-main 運用のため別作業)。
直すまでに作られたタスクは、次回の起動時の migration で `issue` へ移る。
