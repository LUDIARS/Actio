# Schedula 仕様書

> 統合スケジューリングプラットフォーム Schedula の詳細仕様

## ディレクトリ構成

```
spec/
├── core/                    # コアモジュール（常時有効）
│   ├── auth/                # 認証・認可
│   ├── group/               # グループ管理
│   ├── calendar/            # カレンダー・データ統合
│   ├── myplan/              # マイプラン（週間ルーティーン）
│   └── smart-scheduler/     # オートスケジューラ
│
├── module/                  # 機能モジュール（グループ単位で選択可能）
│   ├── m1-curriculum/       # M1: カリキュラム管理
│   ├── m1-schedule-generation/ # M1: 時間割自動生成
│   ├── m1-facility-booking/ # M1: 施設予約
│   ├── holiday/             # 休日管理
│   ├── pm/                  # M2: プロジェクト管理
│   ├── machina/             # M3: タスク自動生成
│   ├── notification/        # M5: 通知システム
│   └── voting/              # M6: 日程調整
│
└── README.md                # 本ファイル
```

## 各モジュールのドキュメント構成

| ファイル | 内容 |
|---------|------|
| `spec.md` | 仕様 — 機能要件・ドメインルール・制約 |
| `usecase.md` | ユースケース — アクター・フロー・事前/事後条件 |
| `dbschema.md` | DBスキーマ — テーブル定義・カラム・制約・インデックス |
| `code.md` | コード構成 — ファイルの役割・依存関係・APIエンドポイント |

## コアモジュール一覧

| モジュール | 概要 |
|-----------|------|
| [Auth](core/auth/) | JWT + Google OAuth によるユーザー認証・ロール管理 |
| [Group](core/group/) | グループの作成・メンバー管理・曜日/日付ベース予定 |
| [Calendar](core/calendar/) | 個人予定・Google Calendar 双方向同期・統合スロット計算 |
| [MyPlan](core/myplan/) | 週間ルーティーン定義・個人予定自動生成 |
| [Smart Scheduler](core/smart-scheduler/) | DP ベースのグループ空き自動計算・最適配置 |

## 機能モジュール一覧

| モジュール | 概要 |
|-----------|------|
| [M1: カリキュラム管理](module/m1-curriculum/) | 学科・講師・カリキュラム・タームの CRUD・CSV インポート |
| [M1: 時間割自動生成](module/m1-schedule-generation/) | DP + CSP による時間割自動配置・入れ替え |
| [M1: 施設予約](module/m1-facility-booking/) | 教室予約・カレンダー連携・予約プラグイン |
| [Holiday](module/holiday/) | 祝日自動計算・休業期間・スケジュール考慮 |
| [PM](module/pm/) | GitHub/Notion タスク同期・分析・コンフリクト解決 |
| [MACHINA](module/machina/) | Slack/Discord 監視・タスク自動生成・PM リレー |
| [Notification](module/notification/) | Webhook/Bot マルチチャンネル通知・テンプレート |
| [Voting](module/voting/) | 投票ベース日程調整・カレンダー自動回答 |

## データフロー

```
M1（授業予定組立）→ Calendar（データ統合）→ Smart Scheduler（空き計算）→ 施設予約（予約登録）→ Notification（通知配信）
```

## 時間割定義

- 曜日: 月〜日（7日間、0=月〜6=日）
- コマ: 1限〜11限（9:30開始、各1時間）
- 1コマ = 1時間、9:30スタート
