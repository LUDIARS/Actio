# チャット受付とDi参加の設定

対応版: Actio `feat/sprint-chat-integration`、Cc `feat/actio-chat-transport`、Di `feat/actio-discussion-participation`。この文書は設定手順であり、現在の配備を有効化した記録ではない。

1. `/tasks/chat` を開きチームを選ぶ。Ccなしでは認証済みの利用者がチームとプロジェクトを作成できる。
2. 配備の暗号化設定またはExcubitor注入で経路を指定する。Ccあり: `ACTIO_CHAT_MODE=concordia`、catalogから解決した`CONCORDIA_URL`、Ccと同じ`ACTIO_CHAT_SHARED_SECRET`。独立Discord: `ACTIO_CHAT_MODE=discord` と `ACTIO_DISCORD_<識別名>` にBotトークンを設定する。秘密値を通常のチーム設定やチャットへ貼らない。
3. 管理者が通常の受付チャンネル、guild/workspace ID、Discordの作成先と保管先カテゴリ、Botシークレット参照名を保存する。チームごとにDiscordまたはSlack一方を使う。独立Slackは対象外。
4. Discord BotにはMessage Content Intentと対象チャンネルの閲覧・履歴取得・投稿・公開スレッド作成/管理・チャンネル管理権限が必要。Botアプリとサーバーへの導入はDiscordの管理画面で行う。SlackはCc側の対象workspaceのBotに履歴/スレッド閲覧・投稿・チャンネル作成/保管の権限を設定する。APIの権限不足は接続・配送エラーとして表示する。
5. 独立配備の内容審査は `ACTIO_INTAKE_LLM_URL`（OpenAI互換APIのbase、例末尾`/v1`）、`ACTIO_INTAKE_LLM_MODEL`、`ACTIO_INTAKE_LLM_KEY` を設定。Cc経由ではCcの会話専用推論を使う。未設定時も受付は保持され、人間の内容確認待ちになる。
6. 朝サマリの時刻とタイムゾーンを確認し、受付・投稿を有効にする。過去の投稿はログとして取得するが、有効化前の投稿から新規タスク受付は起こさない。
7. `++バックログ追加 内容` を投稿し、作成されたスレッドに補足する。Webの受付画面で目的・変更・完了条件・判断理由を確認して確定する。フェーズの承認は既存のスプリント画面で行う。
8. 議論参加を使う場合はcatalogから解決した `DISCUTERE_URL` と、Diと同じ `DISCUTERE_EXTERNAL_DISCUSSION_SECRET` を設定する。場所を選び「議論に乗る」をONにする。Di側の会話専用推論設定が必要。OFFが既定で、新しい人間の投稿以降に評価する。Di停止時は利用不可を表示し、バックログ受付は継続する。
9. 終了後は最終サマリ・ログ取得を確認して保管する。Discordは一般参加者の書込停止とカテゴリ移動、Slackはarchive。配送unknownは自動で再POSTしない。Webで対象を確認し、外部の状態を調べて必要な場合だけ理由付きで再送を許可する。

非公開・外部共有チャンネルは初期対応外。Webログはチーム権限が必須で、検出した閲覧制限変更は再確認まで表示を止める。取込は30秒周期のRESTポーリング。履歴や多数のスレッドの取込、rate limit時は遅れる。最新ページの編集と、過去の削除の巡回確認を行う。未取得範囲は「取込途中」として表示する。

静的型確認は実施。サービス起動・実投稿・画面操作による検証は別途許可とConcordiaへのtesting claim後、Excubitor経由で本体フォルダのみで行う。
