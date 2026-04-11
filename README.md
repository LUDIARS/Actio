# Schedula

汎用スケジューリング & 予約プラットフォーム。

リソース (部屋・設備・人) の予約管理、Webhook 通知、カレンダー統合をコアとして提供し、
ドメイン固有のスケジューリングロジックは **モジュール** として追加できるプラグイン型の設計です。

## 特徴

- **予約システム** — 部屋・タイムスロットの予約、衝突検知、楽観的ロック
- **Webhook & 通知** — イベント駆動の通知配信、HMAC 署名、リトライ、静寂時間
- **認証** — Cernere 認証基盤 (JWT + OAuth)
- **マルチDB対応** — SQLite / PostgreSQL / MySQL (Drizzle ORM)
- **モジュール拡張** — ドメイン固有のスケジューリングロジックをモジュールとして追加可能

## 技術スタック

| 分類 | 技術 |
|------|------|
| バックエンド | Hono + Node.js + TypeScript |
| フロントエンド | React 19 + Vite |
| ORM | Drizzle ORM (SQLite / PostgreSQL / MySQL) |
| 認証 | Cernere (@ludiars/cernere-id-cache) |
| セッション | Redis (ioredis) |

## セットアップ

### 前提条件

- Node.js v22+
- Docker / Docker Compose
- [Infisical](https://infisical.com/) アカウント (シークレット管理)

### 1. 依存インストール

```bash
git clone https://github.com/LUDIARS/Schedula.git
cd Schedula
npm install
cd frontend && npm install && cd ..
```

### 2. Infisical 設定（初回のみ）

```bash
npm run secrets -- setup
```

対話形式で Infisical の認証情報（Site URL / Project ID / Client ID / Client Secret）を入力します。
設定は `.env.secrets` に保存されます（gitignore 済み）。

### 3. デフォルト値を Infisical に登録

```bash
npm run secrets -- initialize
```

`env-cli.config.ts` で定義されたデフォルトの環境変数を Infisical に登録します。
既に存在するキーはスキップされるため、安全に何度でも実行可能です。

### 4. 開発環境の起動

#### 共有インフラ + 開発サーバー

DB / Redis は共有インフラ (`../infra`) を使用します。

```bash
# 共有インフラ起動 (PostgreSQL / Redis)
cd ../infra && docker compose up -d

# バックエンド + フロントエンドを同時起動 (ホットリロード)
npm run dev
```

| プロセス | 説明 | ポート |
|---------|------|--------|
| Backend (tsx watch) | Hono API サーバー | 3000 |
| Frontend (Vite) | React 開発サーバー | 5173 |

個別に起動する場合:

```bash
npm run dev:server   # バックエンドのみ
npm run dev:front    # フロントエンドのみ
```

#### スタンドアロン (Docker)

共有インフラなしで DB/Redis 込みで単体運用:

```bash
npm run env:up:standalone
```

#### ローカル開発 (Docker なし / SQLite)

Docker を使わずに SQLite で開発する場合:

```bash
npm install
npm run dev:server
```

`.env` に以下を設定:

```bash
DB_DIALECT=sqlite
DATABASE_PATH=data/schedula.db
JWT_SECRET=dev-secret
```

## 環境変数管理

環境変数は [Infisical](https://infisical.com/) で一元管理します。

### secrets CLI

| コマンド | 説明 |
|---------|------|
| `npm run secrets -- setup` | 対話形式で Infisical 認証を設定 |
| `npm run secrets -- initialize` | config のデフォルト値を Infisical に登録 (未存在のみ) |
| `npm run secrets -- test` | Infisical 接続テスト |
| `npm run secrets -- list` | シークレット一覧 (値はマスク表示) |
| `npm run secrets -- get <KEY>` | 指定キーの値を取得 |
| `npm run secrets -- set <KEY> <VALUE>` | シークレットを作成/更新 |
| `npm run secrets -- env` | Infisical → `.env` を生成 |
| `npm run secrets -- up` | `.env` 一時生成 → Docker 起動 → `.env` 自動削除 |

### Infisical を使わない場合

`.env.example` をコピーして手動設定:

```bash
cp .env.example .env
# .env を編集して値を設定
docker compose up -d
```

## 認証

認証は [Cernere](https://github.com/LUDIARS/Cernere) に委譲しています。

- ユーザー認証 (ログイン / 登録 / OAuth) は Cernere が担当
- Schedula バックエンドは `@ludiars/cernere-id-cache` で JWT 検証のみ行う
- `CERNERE_URL` が未設定の場合はローカル JWT 検証にフォールバック

## npm スクリプト

| コマンド | 説明 |
|---------|------|
| `npm run dev` | バックエンド + フロントエンド同時起動 (ホットリロード) |
| `npm run dev:server` | バックエンドのみ (tsx watch) |
| `npm run dev:front` | フロントエンドのみ (Vite) |
| `npm run build` | TypeScript コンパイル |
| `npm start` | 本番サーバー |
| `npm test` | テスト実行 |
| `npm run env:up` | 共有インフラ前提でアプリ起動 (Docker) |
| `npm run env:up:standalone` | DB/Redis 込みで単体起動 (Docker) |
| `npm run secrets -- <cmd>` | Infisical シークレット管理 CLI |
| `npm run ci-check` | CI チェック (ビルド + テスト + lint + フロントエンドビルド) |
| `npm run db:push` | Drizzle スキーマ同期 |
| `npm run db:generate` | マイグレーション生成 |
| `npm run db:migrate` | マイグレーション実行 |

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

## ライセンス

[MIT License](LICENSE) — Copyright (c) 2026 LUDIARS
