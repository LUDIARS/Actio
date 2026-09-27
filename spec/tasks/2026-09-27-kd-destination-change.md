---
task: kd-destination-change
project: At
kind: fix
created: 2026-09-27
memory_links: []
---

neco「じゃあDiscordの投稿先の設定だけよろしく」。KDチーム・本社AI実行は維持し、DiscordだけGLabに変更する。所属移管の保留は維持。

管理者向けPUT /api/teams/:teamId/chat/destinationを追加。変更前後の停止、接続先検証、CAS、runtime lease、既存受付/スプリント/未完了配送がないことを必須にする。ログと旧接続・操作主体の監査履歴は保持。切替後の有効化は通常connection APIを使う。既存作業がある場合の移行は本件の対象外。復旧も停止・同じ投稿先変更APIを使う。

回帰ケースを追加、単体テストは許可待ちのため未実行。型確認後Revisorへ提出し、マージ後に本体から設定・反映する。
