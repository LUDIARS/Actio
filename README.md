# Schedula

汎用スケジューリング & 予約プラットフォーム。

リソース (部屋・設備・人) の予約管理、Webhook 通知、カレンダー統合をコアとして提供し、
ドメイン固有のスケジューリングロジックは **モジュール** として追加できるプラグイン型の設計です。

## 特徴

- **予約システム** — 部屋・タイムスロットの予約、衝突検知、楽観的ロック
- **Webhook & 通知** — イベント駆動の通知配信、HMAC 署名、リトライ、静寂時間
- **認証** — JWT + Google OAuth
- **マルチDB対応** — SQLite / PostgreSQL / MySQL (Drizzle ORM)
- **モジュール拡張** — ドメイン固有のスケジューリングロジックをモジュールとして追加可能

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│                  Schedula Core                   │
│                                                  │
│   認証 (Auth)   予約 (Reservations)   通知 (Webhooks)  │
│   /api/auth     /api/reservations     /api/webhooks    │
└────────────┬────────────────────────────────────┘
             │  モジュール登録
    ┌────────┴────────────────┐
    │   School Module         │  ← オプショナル
    │   /api/school           │
    │                         │
    │   M1: 授業予定組立       │
    │   M2: データ統合         │
    │   M3: オートスケジューラ   │
    └─────────────────────────┘
```

### コア

| 機能 | パス | 説明 |
|---|---|---|
| 認証 | `/api/auth` | ユーザー登録・ログイン・JWT・Google OAuth |
| 予約 | `/api/reservations` | リソース (部屋等) の予約 CRUD・衝突検知 |
| Webhook・通知 | `/api/webhooks` | Webhook 管理・通知配信・リマインダー |
| ヘルスチェック | `/api/health` | サーバー稼働状態 |

### School モジュール (`/api/school`)

教育機関向けの授業カリキュラム自動生成モジュールです。コアの予約システムとは独立して動作し、必要に応じて有効化できます。

| サブモジュール | パス | 説明 |
|---|---|---|
| M1: 授業予定組立 | `/api/school/m1` | CSV 取込 → CSP ソルバーによる時間割自動生成 |
| M2: データ統合 | `/api/school/m2` | 授業・個人予定・予約の統合ビュー |
| M3: オートスケジューラ | `/api/school/m3` | グループ空き時間検索・ミーティング提案 |

## セットアップ

### 前提条件

- Node.js v20+
- npm v9+
- Docker / Docker Compose

### クイックスタート (Docker)

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd Schedula

# 2. 依存関係のインストール
npm install

# 3. セットアップ → Docker 起動 (対話形式)
npm run setup
```

`npm run setup` は以下を順に実行します:

1. **Infisical 認証設定** — Client ID / Secret / Project ID を対話入力 → `.env.secrets` に保存
2. **`.env` 生成** — Infisical から全設定を取得し Docker 用 `.env` を自動生成
3. **`docker compose up`** — 生成された `.env` でコンテナ起動

### 環境変数管理

環境変数は [Infisical](https://infisical.com/) で一元管理します。

```
┌─────────────────────────────────────────────────────────┐
│  env-cli setup   → Infisical 認証 (.env.secrets)        │
│  env-cli env     → Infisical → .env 生成                │
│  docker compose  → .env を読んで起動                     │
│  バックエンド     → SecretManager がランタイムで取得      │
└─────────────────────────────────────────────────────────┘
```

| 層 | 管理方法 | 例 |
|---|---|---|
| **インフラ設定** | Infisical → `.env` に出力 → Docker が使用 | ポート, DB接続先, Redis URL |
| **シークレット** | バックエンドが Infisical API でランタイム取得 | JWT_SECRET, Google OAuth |

#### secrets CLI

```bash
npm run secrets -- setup              # Infisical 認証設定
npm run secrets -- env                # .env 再生成
npm run secrets -- list               # シークレット一覧
npm run secrets -- get <KEY>          # 値取得
npm run secrets -- set <KEY> <VALUE>  # 値設定
npm run secrets -- test               # 接続テスト
```

#### Infisical を使わない場合

`.env.example` をコピーして手動設定:

```bash
cp .env.example .env
# .env を編集して値を設定
docker compose up -d
```

### ローカル開発 (Docker なし)

```bash
# バックエンド
npm install
npm run dev          # http://localhost:3000

# フロントエンド
cd frontend && npm install
npm run dev          # http://localhost:5173
```

`.env` に以下を設定:

```bash
DB_DIALECT=sqlite
DATABASE_PATH=data/schedula.db
JWT_SECRET=dev-secret
```

### Docker 開発モード (ホットリロード)

```bash
npm run setup -- --dev
# または
./scripts/setup.sh --dev
```

## モジュール開発

新しいドメインモジュールを追加するには、`SchulaModule` インターフェースを実装します。

```typescript
import { Hono } from "hono";
import type { SchulaModule } from "./shared/types.js";

const myRouter = new Hono();
myRouter.get("/status", (c) => c.json({ ok: true }));

export const myModule: SchulaModule = {
  name: "my-domain",
  description: "カスタムドメインのスケジューリング",
  routes: myRouter,
  basePath: "/api/my-domain",
  submodules: [],
};
```

`src/index.ts` の `modules` 配列に追加するだけで有効化されます。

## npm スクリプト

| コマンド | 説明 |
|---|---|
| `npm run setup` | 対話セットアップ → Docker 起動 |
| `npm run secrets -- <cmd>` | Infisical シークレット管理 CLI |
| `npm run dev` | 開発サーバー (ホットリロード) |
| `npm run build` | TypeScript コンパイル |
| `npm start` | 本番サーバー |
| `npm test` | テスト実行 |
| `npm run db:init` | DB 初期化 |
| `npm run db:generate` | マイグレーション生成 |
| `npm run db:migrate` | マイグレーション実行 |

## 技術スタック

- **Backend**: Hono + Node.js + TypeScript
- **Frontend**: React 19 + Vite
- **ORM**: Drizzle ORM (SQLite / PostgreSQL / MySQL)
- **Auth**: JWT + bcryptjs + Google OAuth

## ライセンス

ISC
