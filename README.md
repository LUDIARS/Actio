# Actio

プラグインベースの「予定 (Event)」 & 「タスク (Task)」管理プラットフォーム。

JIRA のように、**コアの 2 概念 (Event / Task)** を中心に各種プラグイン (カレンダー、プロジェクト管理、学校カリキュラム、日程調整、通知…) が機能を拡充する拡張可能なスケジューリング基盤です。

> **方針転換 (2026-05-20)**: Actio は **タスク管理専用** に絞り込む途中です。
> 予定 (Event) / カレンダー軸は [Schedula](https://github.com/LUDIARS/Schedula)
> として再分離、施設予約は [Aedilis](https://github.com/LUDIARS/Aedilis) に移ります。
> 詳細・移行計画は Schedula リポの `DESIGN.md`。実コード移植は段階実行中で、
> 現状の README は移植前の全体像を記載しています。

## 特徴

- **プラグインアーキテクチャ** — `@ludiars/schedula-sdk` の `defineModule()` で routes / WS commands / DB tables / user data columns を宣言し統合登録
- **コア概念 2 つ**
  - **予定 (Event)**: 時間拘束のある未来の事象 (MTG、講義、予約)
  - **タスク (Task)**: 解決すべき現在の事象 (ToDo、Issue、納期あり要件付き)
- **認証** — [Cernere](https://github.com/LUDIARS/Cernere) に委譲 (JWT + OAuth + opt-out)
- **マルチDB対応** — SQLite / PostgreSQL / MySQL (Drizzle ORM)
- **WebSocket 常時接続** — 破壊的操作は `module_request` 経由、読み取りは REST
- **モジュール有効/無効** — global / group / user の 3 スコープで制御

## 技術スタック

| 分類 | 技術 |
|------|------|
| バックエンド | Hono + Node.js + TypeScript |
| フロントエンド | React 19 + Vite + React Router 7 |
| ORM | Drizzle ORM (SQLite / PostgreSQL / MySQL) |
| 認証 | Cernere (`@ludiars/cernere-id-cache`, `@ludiars/cernere-composite`) |
| セッション | Redis (ioredis) |
| SDK | `@ludiars/schedula-sdk` (module declaration) |
| シークレット管理 | Excubitor Vault 注入 + 暗号化ローカル config、必要時に Vault secret-agent |

## プロジェクト構造

```
Actio/
├── src/                  # バックエンド本体 (Hono + Node.js)
│   ├── auth/             # 認証 (Cernere 連携)
│   ├── db/               # Drizzle schema / repository / dialects
│   ├── plugins/          # モジュールローダー / レジストリ / admin API
│   ├── session/          # セッションストア
│   ├── ws/               # WebSocket ハンドラ & commands
│   ├── shared/           # 共有型 / 定数
│   └── index.ts          # エントリーポイント
├── modules/              # コア機能モジュール (Event / Task / Calendar など)
│   ├── event/            # コア「予定」
│   ├── task/             # コア「タスク」
│   ├── calendar/         # Google Calendar 連携
│   ├── group/            # グループ管理
│   ├── pm/               # プロジェクト管理 (GitHub / Notion)
│   ├── myplan/           # 週間ルーティーン
│   ├── smart-scheduler/  # DP 自動配置
│   ├── holiday/          # 休日・休業期間管理
│   ├── notification/     # Webhook 通知
│   ├── voting/           # 日程調整
│   ├── school/           # M1 学校カリキュラム
│   ├── schedule/         # カリキュラム配置
│   ├── external-api/     # 外部 API (API Key 認証)
│   ├── settings/         # アプリ設定
│   ├── profile/          # プロフィール
│   └── machina/          # (残置: 新規は Discutere へ)
├── modules-ext/          # 動的ロード対象の外部モジュール (PoC)
│   └── example/
├── packages/             # ワークスペースパッケージ
│   ├── sdk/              # @ludiars/schedula-sdk (公開)
│   ├── auth/             # @actio/auth (内部)
│   ├── id-service/       # @actio/id-service (内部)
│   ├── id-cache/         # @ludiars/cernere-id-cache (参照)
├── services/
│   └── id-service/       # スタンドアロン Identity Service
├── frontend/             # React SPA
│   ├── src/pages/        # 各機能ページ
│   ├── src/components/   # Layout, UIBlockRenderer など
│   └── src/lib/          # api, ws-client, module-registry など
├── tests/                # Vitest テスト
├── scripts/              # ci-check.sh, migrate-*, redis-*, setup.sh
├── spec/                 # 仕様書
├── docs/                 # 設計ドキュメント
└── CLAUDE.md             # 開発ルール (AI エージェント向け)
```

## セットアップ

### 前提条件

- Node.js v22+
- Excubitor (通常のサービス起動と Vault からの環境注入)
- Docker / Docker Compose (単体コンテナ運用時のみ)
- GitHub Packages アクセス (`@ludiars/*` モジュールパッケージ取得用)
- Excubitor の Vault に必要な secret と Actio の binding を登録済みであること

### 1. 依存インストール

```bash
git clone https://github.com/LUDIARS/Actio.git
cd Actio

# GitHub Packages 認証 (@ludiars/schedula-module-* を取得するため)
export NODE_AUTH_TOKEN=<your_gh_pat>

npm install
cd frontend && npm install && cd ..
```

### 2. 設定の投入 (初回)

設定はファイルに平文で置かず、次の 2 経路で与えます (仕様: `spec/feature/runtime-modernization.md`)。

- **注入**: Excubitor が Vault の secret・ポート・サービス間 URL を渡す。非secret設定は `excubitor.catalog.yaml` の `env:`、ポート・URLはtopologyで管理する
- **暗号化ローカル config**: DB / Redis 接続文字列などローカル設定だけを保存する

```bash
# ACTIO_CONFIG_KEY (32 バイト以上) を環境に注入した上で、JSON を標準入力から渡す
npm run config:seal < local-settings.json
```

Ex内の優先順位は topology < catalog env < 暗号化 runtime config < Vault。
Actio内では 注入値 > 暗号化ローカル config > 取得secret の順です。
通常起動は `SECRETS_PROVIDER=env` を明示します。`ACTIO_SECRET_KEYS` を設定した場合だけ、既存のVault secret-agentから不足分を取得します。
Actioは `.env` を読みません。env-cliによる設定ファイル生成やInfisicalへの接続は不要です。

### 3. 開発環境の起動

#### Excubitor 起動

通常運用は本体checkoutの `excubitor.catalog.yaml` を使い、Excubitor経由で起動します。
バックエンドの起動コマンドは `node dist/src/bootstrap.js` です。DB / Redisの接続先と必要なsecretを事前に設定してください。
ポート・URLの正本も同catalogです。

開発用の `npm run dev` (API + frontend)、`npm run dev:server` (API)、`npm run dev:front` (frontend) は、
Exによる環境注入を済ませた開発構成から呼ぶ素のコマンドです。設定生成や `.env` 読み込みを挟みません。

#### スタンドアロン (Docker)

Composeファイルと `env:up` / `env:up:standalone` は、単体コンテナ運用用の互換入口として保持します。
これらのnpmスクリプトはDocker Composeを呼ぶだけで、env-cliや設定生成とは無関係です。

- `docker-compose.yaml`: アプリのみ。DB/Redisは共有インフラ前提。
- `docker-compose.standalone.yaml`: DB/Redisを追加するオーバーレイ。
- 明示的な `env_file` はありません。`${...}` の補間には起動元の環境変数とCompose自身の `.env` 解決が使われます。Actioプロセスの `.env` 読み込みとは別です。
- base Composeには旧Infisical bootstrap用の変数が残っています。現行Actioはそれによるsecret取得に対応していません。通常運用にはExのVault注入を使用し、Composeの現行secret供給対応は別途整備が必要です。

既存の単体運用コマンド (本タスクではCompose構成の変更・起動確認は行っていません):

```bash
npm run env:up:standalone
```

#### ローカル開発 (SQLite)

SQLiteを明示的に選ぶ場合は、Exのcatalog `env:` に `DB_DIALECT=sqlite` と `DATABASE_PATH` を設定します。
必要なJWT鍵などのsecretはVaultから注入します。固定の開発用secretを設定ファイルに保存しないでください。

## 環境変数管理

通常起動は Excubitor のVault注入と暗号化ローカル config を使います (`SECRETS_PROVIDER=env`)。
secret-agentの任意補完は「設定の投入」を参照してください。既存の `.env` / `.env.secrets` はこの移行では読み取り・削除せず、所有者が移行確認後に整理します。

| コマンド | 説明 |
|---------|------|
| `npm run config:seal` | 標準入力の JSON から暗号化 config を保存 |
| `npm run env:up` | 共有インフラ前提でアプリのみ Docker 起動 (値は起動元の環境変数から) |
| `npm run env:up:standalone` | DB / Redis 込みで単体 Docker 起動 |

## 認証

認証は [Cernere](https://github.com/LUDIARS/Cernere) に委譲しています。

- フロント: `@ludiars/cernere-composite` で popup / redirect ログイン
- バックエンド: `@ludiars/cernere-id-cache` で JWT 検証 (Redis cache)
- `CERNERE_URL` が未設定時はローカル JWT 検証にフォールバック
- 個人データ (name/email/role) は Cernere が単一情報源 (GDPR 対応)

## npm スクリプト

| コマンド | 説明 |
|---------|------|
| `npm run dev` | バックエンド + フロントエンド同時起動 (ホットリロード) |
| `npm run dev:server` | バックエンドのみ (tsx watch) |
| `npm run dev:front` | フロントエンドのみ (Vite) |
| `npm run build` | TypeScript 型チェック & コンパイル |
| `npm start` | 本番サーバー |
| `npm test` | Vitest テスト実行 |
| `npm run env:up` | 共有インフラ前提でアプリ起動 (Docker) |
| `npm run env:up:standalone` | DB/Redis 込みで単体起動 (Docker) |
| `npm run ci-check` | CI チェック一式 (build + test + lint + frontend build) |
| `npm run db:push` | Drizzle スキーマ同期 |
| `npm run db:generate` | マイグレーション生成 |
| `npm run db:migrate` | マイグレーション実行 |
| `npm run id:service` | スタンドアロン Identity Service 起動 |

## モジュール開発

モジュールは `@ludiars/schedula-sdk` の `defineModule()` で宣言します。

```typescript
import { defineModule } from "@ludiars/schedula-sdk";

export default defineModule({
  id: "my-module",
  name: "My Module",
  schedulaApiVersion: "^1.0.0",
  scope: "per-group",
  basePath: "/api/my-module",

  routes: (app, ctx) => {
    app.get("/hello", (c) => c.json({ ok: true }));
  },

  wsCommands: {
    action: async (userId, payload, ctx) => {
      const user = await ctx.users.get(userId);
      return { user: user.name };
    },
  },

  userData: {
    pref: { type: "json", description: "ユーザー設定" },
  },
});
```

`src/app.ts` の `installModule()` で登録。詳細は [packages/sdk/README.md](packages/sdk/README.md)。

## CI / テスト

CI (GitHub Actions) と pre-push hook は `scripts/ci-check.sh` を共有します。
変更後は必ず以下を実行してください:

```bash
bash scripts/ci-check.sh
```

内容:
1. SDK ビルド (`packages/sdk`)
2. バックエンド型チェック & ビルド
3. バックエンドテスト (Vitest)
4. フロントエンド Lint (ESLint)
5. フロントエンドビルド (Vite)

## ライセンス

[MIT License](LICENSE) — Copyright (c) 2026 LUDIARS
