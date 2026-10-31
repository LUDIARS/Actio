---
project: Actio
kind: task
created: 2026-11-01
---

# 通常モード (Cernere ログイン) のタスク閲覧範囲

依頼: neco「Ludellus のスプリントを本社と MELPOT で共有したい。DB 共通でアクセス範囲指定」
「CF はアクセスログだけ取って Cr で運用しよう。Cr は登録許可制」→ 切替前に閲覧範囲の穴を塞ぐ順で開始 (2026-10-31 承認)。

仕様: `spec/feature/task-visibility.md`

## 受入条件

- [x] 匿名は `/api/tasks` と `GET /api/projects/cc` で 401。
- [x] 管理者・ローカル持ち主以外の `scope=all` / `groupId` 一覧は、owner・assignee・所属チームのタスクに限る。
- [x] `GET /api/tasks/:id` は範囲外 403。
- [x] コメント・リンク・カスタム項目は対象タスクを見られる人だけ (リンク削除は範囲外 404)。
- [x] `cc.acceptance.json` に source / tests を対応付ける。

## 後続 (別手順・要確認)

- `actio-local` 所有タスクの Cernere ユーザーへの移し替え (共有 DB 書き換え)
- Ludellus チームのメンバー登録 (本社 / MELPOT)
- `ACTIO_LOCAL_MODE=0` への切替と再起動、Cernere 側の戻り先確認
- Cloudflare Access ポリシーを「全員通過 + ログ」へ変更 (neco)
- `/api/pm` の組織分離要否
