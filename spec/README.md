# Actio 仕様書

> 統合スケジューリングプラットフォーム Actio の詳細仕様

## ディレクトリ構成

AIFormat [`FORMAT_SPEC.md`](https://github.com/LUDIARS/AIFormat/blob/main/FORMAT_SPEC.md)
の 6 分類フォルダに整理している。

```
spec/
├── feature/     # 機能概要（モジュール別 <module>/ + features.md）
├── data/        # データスキーマ（<module>/dbschema.md + dbs/*.md + dblist.md + data-scheme.md）
├── interface/   # 外部連携（cernere-project.json）
├── plan/        # 実装計画書（cernere-migration.md）
└── README.md    # 本ファイル
```

> `setup/` `test/` は未整備（ドキュメント充実度の gap）。

### 各モジュールのドキュメント構成

機能ドキュメントは `feature/<module>/`、データは `data/<module>/` に分かれる。

| ファイル | 置き場所 | 内容 |
|---------|---------|------|
| `spec.md` | `feature/<module>/` | 仕様 — 機能要件・ドメインルール・制約 |
| `usecase.md` | `feature/<module>/` | ユースケース — アクター・フロー・事前/事後条件 |
| `code.md` | `feature/<module>/` | コード構成 — ファイルの役割・依存関係・API エンドポイント |
| `dbschema.md` | `data/<module>/` | DBスキーマ — テーブル定義・カラム・制約・インデックス |

テーブル個別の詳細は [`data/dbs/<table>.md`](data/dbs/)（一覧は [`data/dblist.md`](data/dblist.md)）。

## コアモジュール一覧

| モジュール | 概要 |
|-----------|------|
| [Auth](feature/auth/) | JWT + Google OAuth によるユーザー認証・ロール管理 |
| [Group](feature/group/) | グループの作成・メンバー管理・曜日/日付ベース予定 |
| [Calendar](feature/calendar/) | 個人予定・Google Calendar 双方向同期・統合スロット計算 |
| [MyPlan](feature/myplan/) | 週間ルーティーン定義・個人予定自動生成 |
| [Smart Scheduler](feature/smart-scheduler/) | DP ベースのグループ空き自動計算・最適配置 |

## 機能モジュール一覧

| モジュール | 概要 |
|-----------|------|
| [M1: カリキュラム管理](feature/m1-curriculum/) | 学科・講師・カリキュラム・タームの CRUD・CSV インポート |
| [M1: 時間割自動生成](feature/m1-schedule-generation/) | DP + CSP による時間割自動配置・入れ替え |
| [M1: 施設予約](feature/m1-facility-booking/) | 教室予約・カレンダー連携・予約プラグイン |
| [Holiday](feature/holiday/) | 祝日自動計算・休業期間・スケジュール考慮 |
| [PM](feature/pm/) | GitHub/Notion タスク同期・分析・コンフリクト解決 |
| [MACHINA](feature/machina/) | Slack/Discord 監視・タスク自動生成・PM リレー |
| [Notification](feature/notification/) | Webhook/Bot マルチチャンネル通知・テンプレート |
| [Voting](feature/voting/) | 投票ベース日程調整・カレンダー自動回答 |

## データフロー

```
M1（授業予定組立）→ Calendar（データ統合）→ Smart Scheduler（空き計算）→ 施設予約（予約登録）→ Notification（通知配信）
```

## 時間割定義

- 曜日: 月〜日（7日間、0=月〜6=日）
- コマ: 1限〜11限（9:30開始、各1時間）
- 1コマ = 1時間、9:30スタート
