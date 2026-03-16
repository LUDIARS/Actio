# Schedula セットアップガイド

Schedula は教育機関向けの授業スケジューリングシステムです。バックエンド (Hono + Node.js) とフロントエンド (React + Vite) で構成されています。

## 前提条件

- **Node.js** v18 以上
- **npm** v9 以上
- **Git**

## 1. リポジトリのクローン

```bash
git clone <repository-url>
cd Schedula
```

## 2. 依存パッケージのインストール

```bash
# バックエンド
npm install

# フロントエンド
cd frontend
npm install
cd ..
```

## 3. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、以下を設定します。

```bash
# サーバー設定
PORT=3000

# データベース設定 (sqlite / postgres / mysql)
DB_DIALECT=sqlite
DATABASE_PATH=data/schedula.db

# JWT 認証
JWT_SECRET=your-secret-key-change-in-production

# Google OAuth (任意)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

> **注意**: `JWT_SECRET` は本番環境では必ず安全なランダム文字列に変更してください。

## 4. データベースの初期化

### SQLite（デフォルト・推奨）

```bash
npm run db:init
```

これにより `data/schedula.db` にデータベースファイルが作成されます。

### PostgreSQL / MySQL を使用する場合

```bash
# 環境変数を設定
export DB_DIALECT=postgres
export DATABASE_URL=postgresql://user:password@localhost:5432/schedula

# マイグレーション実行
npm run db:generate
npm run db:migrate
```

## 5. 開発サーバーの起動

ターミナルを 2 つ開いて、それぞれ実行します。

### バックエンド

```bash
npm run dev
```

`http://localhost:3000` でAPIサーバーが起動します。

### フロントエンド

```bash
cd frontend
npm run dev
```

`http://localhost:5173` でフロントエンドの開発サーバーが起動します。

## 6. 動作確認

```bash
# ヘルスチェック
curl http://localhost:3000/api/health
```

ブラウザで `http://localhost:5173` にアクセスし、ログイン画面が表示されれば成功です。

## 7. 本番ビルド

```bash
# バックエンド
npm run build
npm start

# フロントエンド
cd frontend
npm run build
npm run preview  # ビルド結果のプレビュー
```

## 8. 主な npm スクリプト

### バックエンド

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 (ホットリロード) |
| `npm run build` | TypeScript コンパイル |
| `npm start` | 本番サーバー起動 |
| `npm run db:init` | データベース初期化 |
| `npm run db:generate` | マイグレーションファイル生成 |
| `npm run db:migrate` | マイグレーション実行 |
| `npm run db:push` | スキーマを直接反映 |

### フロントエンド

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run preview` | ビルド結果プレビュー |
| `npm run lint` | ESLint 実行 |

## プロジェクト構成

```
Schedula/
├── src/                    # バックエンド
│   ├── index.ts            # エントリーポイント
│   ├── auth/               # 認証ルート
│   ├── db/                 # データベース層 (Drizzle ORM)
│   ├── middleware/          # ミドルウェア
│   ├── modules/
│   │   ├── m1/             # 授業予定組立ツール
│   │   ├── m2/             # データ統合
│   │   ├── m3/             # オートスケジューラ
│   │   ├── m4/             # 予約システム
│   │   └── m5/             # 通知・Webhook
│   └── shared/             # 共有定数・型定義
├── frontend/               # フロントエンド (React + Vite)
│   └── src/
│       ├── pages/          # ページコンポーネント
│       ├── components/     # 共通コンポーネント
│       ├── contexts/       # React Context
│       └── lib/            # API クライアント・定数
├── drizzle.config.ts       # Drizzle ORM 設定
├── package.json
└── tsconfig.json
```

## トラブルシューティング

### ポートが使用中の場合

```bash
# PORT 環境変数で変更
PORT=3001 npm run dev
```

### データベースエラーが発生する場合

```bash
# データベースを再作成
rm -f data/schedula.db
npm run db:init
```

### フロントエンドから API に接続できない場合

フロントエンドの `VITE_API_BASE` がバックエンドのアドレスと一致しているか確認してください。

```bash
VITE_API_BASE=http://localhost:3000 npm run dev
```
