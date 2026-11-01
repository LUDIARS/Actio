# Cc の指示者を操作ログに残す (AT-CC-ACTING-FOR)

依頼: neco「Cc の指示の主体を見分けたい」(2026-11-01)。パターン 2「操作ログだけ」を選択。
パターン 3 (Discord ↔ Cernere の対応付けでタスクに Cernere 利用者を残す) は後続。

## 目的

Concordia (Cc) は Actio にローカル持ち主 (`actio-local`, loopback) として書き込む。
そのため Actio の記録からは、どの人の指示で書かれたかが分からない。
Cc が分かっている「直近で指示した人」を、書き込みごとに操作ログへ残す。

## 契約

| 項目 | 内容 |
|------|------|
| ヘッダ | `x-actio-acting-for: <platform>:<userId>` |
| platform | `discord` / `slack` |
| userId | `[A-Za-z0-9_-]{1,64}` |
| 対象 | `/api/*` の POST / PUT / PATCH / DELETE |
| 信用する経路 | loopback (この PC から直接) だけ。トンネル・通常ログインの要求に付いたヘッダは無視する |
| 記録先 | `logs/activity.log` (action=`cc:acting-for`, userId=`actio-local`, detail=`<METHOD> <path> status=<code> acting-for=<platform>:<id>`) |
| DB | 保存しない (個人データの正本は Cernere) |

形式に合わない値 (改行・区切り文字・不明な platform) は記録しない。
記録の失敗は応答に影響させない。

## 実装

- `src/auth/acting-for.ts`: 申告の検証と、応答後に操作ログへ書く middleware
- `src/app.ts`: `/api/*` の userContext の直後に組み込む
- Concordia 側: Actio への書き込みに直近の指示者をヘッダで付ける (Concordia の別 PR)
