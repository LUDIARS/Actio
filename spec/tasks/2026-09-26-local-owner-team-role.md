---
task: local-owner-team-role
project: At
kind: implementation
status: delegated
delegation_run_id: 785c3f2f-fa78-4680-851a-d76c6045d0db
source_session: lictor-62378dfb-687f-44c8-9124-7271cf563acc
created: 2026-09-26
actio_task_id: d0343196-f544-4a20-80a7-b8b7304cdf10
memory_links:
  - ../feature/local-mode-cf-access.md
  - ../feature/team-task/spec.md
---

# ローカルモードの持ち主に Cc 同期済みチームの leader 相当を与える

## 目的

neco の指示 (「Actio のチームに既存のチームを登録しよう」「バックログをその後定義したい」) による。
ローカルモードの固定ユーザー `actio-local` はどのチームの `team_members` にも居ないため、
Cc から同期した `team_refs` があっても `GET /api/teams` が空になり、計画画面でチームを選べず、
バックログもスプリントも作れなかった。ローカルモードは「この PC の持ち主 1 人」の配備なので、
持ち主を全チームの leader 相当として扱う。

仕様: `../feature/local-mode-cf-access.md` §4.1、`../feature/team-task/spec.md` §3。

## 方式

- `src/auth/local-owner.ts` を新設。判定は純関数 `isLocalOwner(userId, accessKind, localModeEnabled)` と
  `localOwnerTeamRole(teamExists)` に分け、境界 middleware が記録した経路から判定する
  `isLocalOwnerRequest(c)` と、`requireRole` を変えずに合成する `allowLocalOwnerOr(fallback)` を置く。
- `requireTeamRole` (`src/auth/team-role.ts`) は membership 参照の 1 か所だけを分岐させ、
  持ち主なら `team_refs` の存在で `leader` を返す (未知 teamId は従来どおり 403)。
  `TeamRole` に admin は無く、leader を超える要求は `roleSatisfies` で拒否される。
- `GET /api/teams` は admin 分岐と同型で、持ち主には `team_refs` 全件を role `leader` で返す。
- `PUT/DELETE /api/teams/:teamId/members/:userId` は `allowLocalOwnerOr(requireRole("admin"))` に置き換え、
  持ち主にも許す (spec の役割表で「ローカルモードの持ち主 = admin 相当」と明記)。
- legacy の `users.role` は読まない。持ち主の権限は DB に保存せず、要求ごとに経路から決める。
- spec: `local-mode-cf-access.md` §4.1 (持ち主のチーム権限) と §7、`team-task/spec.md` §3 の役割表に列を追加。
  `local-auth-mode.md` の「ローカルモードはチーム membership 権限を与えない」を §4.1 参照に改めた。

## 公開配備への非適用

- 持ち主の条件は「ローカルモード有効」「境界 middleware が経路 (loopback / 検証済み cf-access) を確定済み」
  「userId が `actio-local`」の 3 つすべて。公開配備では経路が常に null なので一切適用されない。
- `actio-local` を名乗るトークンを公開配備に送っても、チーム一覧は空、計画 API とメンバー変更は 403 のまま
  (回帰テストで固定)。
- Cc service 経路 (api_client + `X-Decided-By`) の判定は変えていない。

## 再利用探索

- Anatomia plan の手本 `requireGroupRoleMiddleware` (`src/plugins/permissions.ts`) はグループロール用で
  team_refs を扱わないため不採用。経路判定は既存の `localAccessKind` / `localModeEnabled`
  (`src/auth/local-mode.ts`) を再利用し、全件一覧は既存 `teamRefRepo.listAll()` を admin 分岐と共用した。

## 検証 (実施 / 未実施)

実施:
- `tsc --noEmit`: エラー 0。
- vitest 対象 4 ファイル (`tests/unit/local-owner.test.ts`, `tests/api/local-owner-teams.test.ts`,
  `tests/api/team-members.test.ts`, `tests/unit/team-role.test.ts`): 45 件すべて成功。
- vitest 全体: 43 ファイル / 336 件すべて成功 (既存テストの破損なし)。
- Anatomia `verify --repo <worktree>` (diff 入力): 5 ゲートすべて PASS。`pr-review --repo <worktree>`:
  verify PASS、違反・循環 0、spec の無い変更ファイル 0、未割当アンカー 0。
- 着地ドメインは既存の identity-access (`src/auth/`)・task-modules (`modules/task/team-*.ts`)・
  service-runtime (`tests/`) で、domain.json の追加は不要。

未実施・注記:
- フロントエンド lint / build: フロントは変更していない (`PlanningPage` は role `leader` で編集可になる既存実装)。
- cf-access 経路の route テスト: JWT 署名検証を伴うため、純関数と middleware の unit テストで cf-access を検証した。
- 実機の起動確認: サービスの起動・再起動は行っていない。
- `npm test` の pretest (`sdk:build`) は通さず vitest を直接実行した。検証用の依存は本体 checkout の
  `node_modules` をジャンクションで借り、検証後に外した。
- `anatomia verify --project actio` は本体 checkout のグラフ (新しい spec 節を含まない) を読むため、
  新関数が spec_linkage (warn) に出る。worktree を解析する `--repo` / `pr-review` では PASS。
- Augur 契約 (`augur.contracts.json`): contract-wrap が `@ludiars/log-weaver` の import を注入するが
  Actio はこの依存を持たないため導入していない。受け入れ条件は下記の契約書式で記録した。

## 受け入れ条件

- C-1 isLocalOwner(userId, accessKind, localModeEnabled): ローカルモード有効・経路 loopback / cf-access・userId `actio-local` をすべて満たすときだけ true
- C-2 localOwnerTeamRole(teamExists): `team_refs` にあるチームは `leader`、無いチームはロール無し
- C-3 requireTeamRole(...): 持ち主は `team_refs` にあるチームで `teamRole=leader` / `actingUserId=actio-local` として通り、無い teamId は 403
- C-4 GET /api/teams: 持ち主には `team_refs` 全件を role `leader` で返す
- C-5 PUT/DELETE /api/teams/:teamId/members/:userId: 持ち主にも許す (`requireRole` は変えず middleware を合成)
- C-6 公開配備: ローカルモード無効なら `actio-local` を名乗るトークンでも従来どおり (チーム一覧は空、計画 API とメンバー変更は 403)

## 追補: Revisor 登録テストのタイムアウト (Actio タスク ca33ac06-6eb3-47d1-adb9-77e67037d493)

Revisor local PR #2008 の登録テスト (`npm test`) が 2 回続けて失敗した。API スイートが `beforeAll` の
`await import("../../src/app.js")` で `Hook timed out in 15000ms` になる。記録:
`../plan/problem_logs/2026-09-26-vitest4-parallel-api-hook-timeout.md`。

- 原因: Vitest 4 で `test.poolOptions` が削除され、`poolOptions.forks.singleFork: true` が無視されていた。
  そのためテストファイルが最大 `コア数 - 1` の fork で並列に走る。各 API スイートは app 全体を cold import し
  (単独で約 7 秒)、並列では競合して 15 秒を超える。同じクリーン手順で `main` (9989a42) も 14 スイート失敗するため、
  持ち主権限の変更は原因ではない。委託時の仮説 (a) secrets / 循環 import、(b) `allowLocalOwnerOr` のモジュール
  スコープ評価、(c) `sdk:build` 経由の import は、import 内訳 (I/O 待ち無し、本 PR のモジュールは上位外) で否定した。
  認可は既に要求時に判定しており、読込時に secrets / DB / ネットワークへは触れていない。
- 修正: `vitest.config.ts` で直列実行を Vitest 4 の `maxWorkers: 1` で表し、`poolOptions` を外した。
  `hookTimeout` / `testTimeout` は変えない (本当の hang は従来どおり落とす)。
  回帰テスト `tests/unit/vitest-config.test.ts` で `maxWorkers === 1` と `poolOptions` 不在を固定した。
- 再利用探索: 独自の順序制御は作らず、Vitest 標準の `maxWorkers` (移行ガイドの置き換え先) を使った。
  Anatomia plan の手本 (`tests/helpers.ts:insertTestApiClient`) は設定変更に無関係のため不採用。
- 着地ドメイン: 既存の service-runtime (`*.config.ts` と `tests/` を membership に含む)。domain.json の追加は不要。
- `main` (#2005, 9989a42) を `git merge main` で取り込んだ。`src/auth/loopback-or-admin.ts` と sprints ルートはそのまま。

検証 (2026-09-26、コミット bf8e238 を別フォルダへクリーン clone して実施):
- `git submodule update --init --recursive` → `npm ci --include=dev` → `npm test` (pretest `sdk:build` 込み):
  52 ファイル / 380 件すべて成功 (133 秒)。`poolOptions` の DEPRECATED 表示も消えた。
- 修正前の同じ手順: 本ブランチ 13 ファイル失敗、`main` 9989a42 は 14 ファイル失敗 (すべて Hook timed out)。
- `npm run typecheck`: エラー 0。
- Anatomia `verify --repo <worktree>` (`git diff main...HEAD` 入力): 5 ゲートすべて PASS。
- 注記: 直列化で `npm test` は約 2〜3.5 分かかる (Revisor の上限 600 秒内)。

- C-7 vitest.config.ts: テストファイルを直列 (`maxWorkers: 1`) で実行し、クリーンな `npm ci` + `npm test` で API スイートが hookTimeout に達しない

## 範囲外

- `modules/task/team/project-routes.ts` と `modules/task/planning/` は並行作業があるため触らない。
