# タスクの閲覧範囲 (AT-TASK-VISIBILITY)

## 1. 目的

本社と MELPOT が同じ Actio (同じ DB) で Ludellus のスプリントを共有する。アクセス範囲はチームで分ける。
Cloudflare Access はアクセスログの取得だけを担い、利用者の識別と登録の許可は Cernere が行う
(Cernere は登録許可制、許可待ちのユーザーはサービスにログインできない)。
そのため通常モード (`ACTIO_LOCAL_MODE=0`) で、ログイン済みの利用者どうしが互いのタスクを見られない状態を保証する。

ローカルモード (この PC の持ち主 1 人) の挙動は変えない。持ち主は従来どおり全件を見る。

## 2. 匿名

- `/api/tasks` 配下は認証済みユーザーだけが使える。匿名は 401。
  旧来の「匿名は既定の個人ユーザー (`ACTIO_PERSONAL_USER_ID`, 既定 `local`) として扱う」フォールバックは使われなくなる。
- `GET /api/projects/cc` (Cc 同期済みプロジェクト一覧) も匿名は 401。

## 3. 閲覧者と範囲

| 閲覧者 | 見えるタスク |
|---|---|
| Actio 管理者 (`userRole=admin`) | 全件 |
| ローカルモードの持ち主 (`actio-local`, 確定済み経路のみ) | 全件 |
| それ以外 | owner が自分 / assignee が自分 / `team_id` が自分の所属チーム (`team_members`) |

- 所属チームは要求ごとに `team_members` から引く (外したメンバーを即座に締め出す)。
- `GET /api/tasks`:
  - `scope=owned` / `scope=assigned` は従来どおり。
  - `team_id` 指定は従来どおりチームの member 以上 (403)。
  - `scope=all` (既定以外の値を含む) と `groupId` 指定は、上の範囲で絞る。Cc は一般ユーザーの Bearer で
    `scope=all&pluginId=concordia` を引くため、管理者限定 (403) にはせず範囲で絞る。
- `GET /api/tasks/:id`: 範囲外は 403。チームタスクの owner / assignee は所属外でも見える。
- 更新・削除の判定 (owner / assignee / 管理者) は変えない。

チーム・スプリント系 (`/api/teams/:teamId/...`) は従来どおり `requireTeamRole` で守られている。

## 4. 拡張データ (コメント / リンク / カスタム項目)

対象が `task` のとき、そのタスクを見られる人だけが読み書きできる。

| 経路 | 対象タスクが無い | 範囲外 |
|---|---|---|
| `GET /api/comments/task/:id`, `POST /api/comments` | 404 | 403 |
| `GET /api/links/task/:id`, `POST /api/links` (両端) | 404 | 403 |
| `DELETE /api/links/:id` (両端) | 404 | 404 (存在を漏らさない) |
| `GET/PUT/DELETE /api/custom-fields/.../task/:id` | 404 | 403 |

`event` 対象は Schedula 分離の対象で閲覧範囲の正本が Actio に無いため、判定しない。
コメントの更新・削除は従来どおり作成者だけ。

## 5. 範囲外 (このリリースで変えないもの)

- `/api/pm` はログイン済みなら全 PM プロジェクトを読み書きできる。組織で分けるかは別途判断する。
- WS コマンド、`/api/groups` 系、外部 API (`/api/external`, API キー) は対象外。
- 既存タスクの持ち主 (`actio-local`) を Cernere ユーザーへ移すデータ移行、チームメンバー登録、
  `ACTIO_LOCAL_MODE=0` への切り替えと再起動、Cloudflare Access ポリシー変更は別手順。

## 6. 実装

- 判定: `src/auth/task-visibility.ts` (`canViewTask` / `isUnrestricted` は純関数、`resolveTaskViewer` が DB を引く)
- 一覧の絞り込み: `TaskListFilter.visibleTo` (`src/db/task-list-conditions.ts`)
- 拡張データ: `src/plugins/task-target-access.ts`
- テスト: `tests/unit/task-visibility.test.ts`, `tests/api/tasks.test.ts`, `tests/api/plugin-ext-api.test.ts`
