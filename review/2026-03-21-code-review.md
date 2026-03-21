# Schedula コードレビュー — 2026-03-21

## 概要

プロジェクト全体を対象に、セキュリティ・設計・コード品質・パフォーマンスの観点から包括的レビューを実施。

---

## 🔴 CRITICAL（即時対応が必要）

### 1. 認証バイパス — `getUserId(c) || ""` パターン

匿名ユーザーがデータ作成・更新・削除可能な状態。`getUserId(c)` が null を返した場合、空文字列で処理が続行される。

| ファイル | 行 |
|---------|-----|
| `modules/voting/routes.ts` | 19, 131, 191, 253, 287 |
| `modules/schedule/routes.ts` | 63, 79, 112, 128, 208, 261, 317, 355, 435 |
| `modules/settings/routes.ts` | 72 |
| `modules/notification/channels/webhook/routes.ts` | 20 |

**正しいパターン**（`modules/calendar/routes.ts` で使用済み）:

```typescript
const userId = getUserId(c);
if (!userId) return c.json({ error: "Authentication required" }, 401);
```

**影響**: 投票イベントの作成・削除、カリキュラムの変更、設定の書き換え等が未認証で可能。

---

### 2. ハードコードされた JWT シークレット

- **場所**: `src/middleware/auth.ts:5`, `src/auth/routes.ts:11`
- **内容**: デフォルト値 `"schedula-dev-secret-change-in-production"`
- **リスク**: 本番環境で `JWT_SECRET` 環境変数が未設定の場合、この既知の文字列で全トークンを偽造可能

```typescript
const JWT_SECRET = process.env.JWT_SECRET || "schedula-dev-secret-change-in-production";
```

**対策**: 起動時に `JWT_SECRET` が未設定ならエラー終了させる。

---

### 3. CORS が全オリジン許可

- **場所**: `src/app.ts:32`
- **内容**: `app.use("*", cors())` — デフォルト設定で全オリジンを許可
- **リスク**: 悪意あるサイトからの API 呼び出しが可能

**対策**:

```typescript
app.use("*", cors({ origin: process.env.FRONTEND_URL || "http://localhost:8080" }));
```

---

## 🟠 HIGH（リリース前に修正）

### 4. OAuth トークンが URL パラメータで受け渡し

- **場所**: `src/auth/routes.ts:290-291`, `frontend/src/contexts/AuthContext.tsx:32-48`
- **リスク**: ブラウザ履歴、サーバーログ、Referer ヘッダーにトークンが残る
- **対策**: POST リダイレクト + httpOnly Cookie ベースのフローに変更

### 5. JWT トークンを localStorage に保存

- **場所**: `frontend/src/lib/api.ts:14-15`
- **リスク**: XSS 攻撃があればトークン窃取可能
- **対策**: httpOnly Cookie への移行

### 6. ハードコードされたユーザーID フォールバック

- **場所**: `frontend/src/pages/ReservationsPage.tsx:705`, `SchedulerPage.tsx:57`
- **内容**: `createdBy: localStorage.getItem("userId") || "user-1"`
- **リスク**: 認証されていないユーザーが `user-1` としてデータを作成可能
- **対策**: `useAuth().user.id` から取得

### 7. N+1 クエリ問題

| 場所 | 内容 | 影響 |
|------|------|------|
| `modules/group/routes.ts:60-68` | メンバー毎にユーザー個別取得 | 50人のグループ → 53クエリ |
| `modules/group/routes.ts:24-28` | グループ一覧でグループ毎に個別取得 | 1 + 2N クエリ |
| `modules/voting/routes.ts:68-70` | イベント毎に候補を個別取得 | 1 + N クエリ |
| `modules/voting/auto-reply.ts:46-47` | グループ毎にスケジュール個別取得 | 1 + N クエリ |

**対策**: `IN` 句を使ったバッチ取得リポジトリ関数を追加。

### 8. CSRF 保護なし

- 全 POST/PUT/DELETE エンドポイントに CSRF トークン検証が存在しない
- **対策**: Hono 用 CSRF ミドルウェアの導入、または SameSite Cookie + Origin ヘッダー検証

### 9. レートリミットなし

- `/api/auth/login` — ブルートフォース攻撃
- `/api/auth/register` — スパムアカウント作成
- `/api/smart-scheduler/solve` — 計算コストの高いエンドポイントへの DoS
- **対策**: IP ベースのレートリミットミドルウェア追加

---

## 🟡 MEDIUM（改善推奨）

### 10. セキュリティヘッダー未設定

`src/app.ts` に以下のヘッダーがいずれも設定されていない:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security`
- `X-XSS-Protection`

### 11. CLAUDE.md ルール違反 — 直接 DB アクセス

| ファイル | 行 | 内容 |
|---------|-----|------|
| `modules/settings/routes.ts` | 11, 108-129 | `db.execute(sql.raw(...))` でリポジトリ層をバイパス |
| `src/admin/db-viewer.ts` | 97, 118, 125 | `sql.raw()` で動的 SQL 構築 |

CLAUDE.md のルール:「ルートハンドラから `db` を直接操作してはいけません」に違反。

### 12. レガシー認証フォールバック（本番リスク）

- **場所**: `src/middleware/auth.ts:59-65`
- **内容**: `X-User-Id` / `X-User-Role` ヘッダーで JWT をバイパス可能
- **リスク**: 本番環境で任意のユーザー・ロールになりすまし可能

```typescript
const userId = c.req.header("X-User-Id") || "anonymous";
const role = (c.req.header("X-User-Role") as UserRole) || "general";
```

**対策**: 本番では無効化するか、完全に削除。

### 13. `any` 型の濫用

- **場所**: `frontend/src/lib/api.ts`
- **内容**: `request<any>` が **188箇所**
- **影響**: TypeScript の型チェックが事実上無効化

### 14. サイレントエラー

| ファイル | 行 | 内容 |
|---------|-----|------|
| `frontend/src/pages/SmartSchedulerPage.tsx` | 80-83 | `.catch(() => {})` で失敗を無視 |
| `frontend/src/pages/ReservationsPage.tsx` | 914-915 | 同上 |
| `frontend/src/pages/Dashboard.tsx` | 106-159 | 5つの API 呼び出しの失敗を無視 |
| `modules/calendar/routes.ts` | 265-272 | エラー時に空配列を返却 |

### 15. トークンリフレッシュの競合状態

- **場所**: `frontend/src/lib/api.ts:68-81`
- **内容**: 複数の 401 レスポンスが同時発生した場合、複数のリフレッシュリクエストが発火
- **対策**: mutex/singleton パターンでリフレッシュを排他制御

---

## 🔵 LOW（技術的負債）

### 16. コード重複

| パターン | 出現回数 | 場所 |
|---------|---------|------|
| `findByUserId()` リポジトリ関数 | 6箇所 | `src/db/repository.ts` (348, 418, 481, 700, 1062, 1103) |
| `if (!name?.trim())` バリデーション | 8箇所以上 | `modules/schedule/routes.ts` 他 |
| day/period 範囲チェック | 3箇所以上 | calendar, reservation, group |
| CSV インポート関数 | 3関数 | `frontend/src/lib/api.ts:495-566` |
| メンバーシップチェック | 4箇所以上 | group, calendar 他 |

**対策**:

- 共通バリデーションヘルパー関数の抽出
- ジェネリックなリポジトリヘルパーの導入

### 17. エラーメッセージの言語混在

日本語と英語が混在しており、フロントエンドの i18n 対応が困難:

- 日本語: `"グループが見つかりません"`, `"認証が必要です"`
- 英語: `"Authentication required"`, `"Group not found"`

### 18. 巨大ファイル

| ファイル | 行数 | 推奨 |
|---------|------|------|
| `modules/schedule/routes.ts` | 1,469行 | departments / curricula / placements に分割 |
| `src/db/repository.ts` | 1,372行 | ドメイン別ファイルに分割 |
| `frontend/src/lib/api.ts` | 大量のAPI定義 | モジュール別に分割 |

### 19. `as never` 型アサーション

- **場所**: `src/middleware/auth.ts:12, 50-51, 55-56`
- **内容**: Hono コンテキストの型を `as never` で回避
- **対策**: 適切な Hono コンテキスト型定義を導入

### 20. 本番用 console.log 残存

- フロントエンド全体で **37箇所** のデバッグログが残存
- **リスク**: 情報漏洩（攻撃者にアプリケーションフローのヒントを提供）
- **対策**: 環境別ロガー、または本番ビルドでの自動除去

### 21. 型安全性の不足

- `src/db/repository.ts` の多数の関数に明示的な戻り値型がない
- `frontend/src/contexts/AuthContext.tsx:24` — `getStoredUser()` の null ハンドリング不足

### 22. フロントエンドの UX 問題

- フォーム送信中のローディング状態が未実装（二重送信リスク）
- API エラー時のユーザー通知が不十分
- ローディングスケルトン未実装

---

## ✅ 良い点

- **リポジトリパターン**: 11モジュール全てが基本的にリポジトリ層を経由
- **パスワードハッシュ**: bcryptjs 12ラウンド（`src/auth/routes.ts:82`）
- **Drizzle ORM**: パラメータ化クエリで SQL インジェクション防止
- **リフレッシュトークンローテーション**: 使用済みトークンの無効化
- **DB 方言抽象化**: SQLite/PostgreSQL/MySQL 対応設計
- **Admin 保護**: DB Viewer は `requireRole("admin")` で保護
- **Webhook シークレット**: `randomBytes(32)` で安全に生成 + ローテーション機能あり

---

## 対応優先度マトリクス

| 優先度 | 対応項目 | 工数 | カテゴリ |
|-------|---------|------|---------|
| **P0** | `getUserId(c) \|\| ""` → 認証必須チェックに修正 | 小 | セキュリティ |
| **P0** | JWT_SECRET を環境変数必須に（未設定時は起動エラー） | 小 | セキュリティ |
| **P0** | CORS にオリジン制限追加 | 小 | セキュリティ |
| **P1** | レガシーヘッダー認証（X-User-Id）の本番無効化 | 小 | セキュリティ |
| **P1** | レートリミット追加（認証エンドポイント） | 小 | セキュリティ |
| **P1** | セキュリティヘッダー追加 | 小 | セキュリティ |
| **P1** | localStorage → httpOnly Cookie 移行 | 中 | セキュリティ |
| **P1** | N+1 クエリをバッチ取得に修正 | 中 | パフォーマンス |
| **P1** | ハードコード `"user-1"` を認証コンテキストに変更 | 小 | セキュリティ |
| **P2** | CLAUDE.md ルール違反の修正（settings, db-viewer） | 小 | 設計 |
| **P2** | CSRF 保護の導入 | 中 | セキュリティ |
| **P2** | 共通バリデーションヘルパー抽出 | 中 | コード品質 |
| **P2** | サイレントエラーの修正 | 中 | 信頼性 |
| **P3** | `any` 型の削減・型安全性改善 | 大 | コード品質 |
| **P3** | 巨大ファイルの分割 | 大 | 保守性 |
| **P3** | エラーメッセージの言語統一 | 中 | 保守性 |
| **P3** | console.log の除去 | 小 | セキュリティ |
