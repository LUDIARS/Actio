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

- Node.js v18+
- npm v9+

### インストール

```bash
# バックエンド
npm install

# フロントエンド
cd frontend && npm install && cd ..
```

### 環境変数

`.env` ファイルをプロジェクトルートに作成します。

```bash
PORT=3000

# データベース (sqlite / postgres / mysql)
DB_DIALECT=sqlite
DATABASE_PATH=data/schedula.db

# JWT
JWT_SECRET=your-secret-key-change-in-production

# Google OAuth (任意)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### データベース初期化

```bash
npm run db:init
```

### 起動

```bash
# バックエンド (http://localhost:3000)
npm run dev

# フロントエンド (http://localhost:5173)
cd frontend && npm run dev
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
| `npm run dev` | 開発サーバー (ホットリロード) |
| `npm run build` | TypeScript コンパイル |
| `npm start` | 本番サーバー |
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
