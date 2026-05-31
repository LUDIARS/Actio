# Actio 認証 Cernere 移行計画

## 現状分析

### 現在のアーキテクチャ

Actio は `packages/id-service/`（`@actio/id-service`）を使い、**認証を自前で完結**している。

```
フロントエンド → Actio バックエンド → ローカル DB (users / sessions)
                    ├── JWT 発行・検証
                    ├── bcrypt パスワード認証
                    ├── Google OAuth
                    ├── セッション管理 (Redis / DB)
                    └── ユーザー CRUD
```

### 認証関連ファイル一覧

| ファイル | 役割 | 移行影響 |
|---------|------|---------|
| `src/auth/routes.ts` | 認証ルート（`createAuthRoutes()` 呼び出し） | **大: 削除 → Cernere 委譲** |
| `src/middleware/auth.ts` | `userContext()` / `requireRole()` ミドルウェア | **大: id-cache に置換** |
| `src/middleware/getUserId.ts` | `getUserId()` / `getUserRole()` ヘルパー | **中: import 元変更** |
| `src/config/jwt.ts` | JWT シークレット解決 | **中: ローカル検証用に残すか判断** |
| `src/config/secrets.ts` | SecretManager (Infisical/SSM/env) | 変更なし |
| `packages/id-service/` | ローカル認証 SDK 全体 | **大: @cernere/id-cache に置換** |
| `packages/id-cache/` | 未使用のキャッシュパッケージ | 削除（Cernere 側を使用） |
| `modules/setup/routes.ts` | 初回セットアップ（Infisical/SSM 設定） | 変更なし |
| `modules/profile/routes.ts` | プロフィール・プロジェクトロール | **小: userId 取得方法の確認** |
| `frontend/src/lib/api.ts` | auth セクション全体 | **大: Cernere エンドポイントに変更** |
| `frontend/src/contexts/AuthContext.tsx` | React 認証状態管理 | **大: Cernere フローに変更** |
| `frontend/src/pages/LoginPage.tsx` | ログイン / 登録画面 | **大: Cernere UI へリダイレクト** |

### 現在の DB スキーマ（認証関連）

**`users` テーブル:**
```
id, name, email, role, major,
passwordHash, googleId, googleAccessToken, googleRefreshToken,
googleTokenExpiresAt, googleScopes, calendarAccessId,
lastLoginAt, createdAt, updatedAt
```

**`sessions` テーブル:**
```
id, userId, refreshToken, expiresAt, createdAt
```

**`userProfiles` テーブル:**
```
id, userId, bio, displayName, avatarUrl, createdAt, updatedAt
```

**`userProjectRoles` テーブル:**
```
id, userId, groupId, roleName, createdAt, updatedAt
```

### 現在のロール体系

| レベル | ロール | 説明 |
|--------|--------|------|
| システム | `admin` | 全権限 |
| システム | `group_leader` | グループリーダー |
| システム | `general` | 一般ユーザー |
| グループ | `roleName` (自由テキスト) | プロジェクトロール（PM、デザイナー等） |

---

## 移行先アーキテクチャ

```
フロントエンド → Cernere (認証 UI / JWT 発行)
    │
    │ Authorization: Bearer <jwt>
    ▼
Actio バックエンド
    ├── @cernere/id-cache ミドルウェア (JWT 検証 + キャッシュ)
    │     ├── ローカル JWT 検証 (jwtSecret あり)
    │     ├── キャッシュヒット → ユーザー返却
    │     └── キャッシュミス → Cernere /api/auth/verify
    │
    ├── Actio 固有データ (groups, profiles, projectRoles, calendar)
    └── Cernere WebSocket セッション (破壊的操作時)
```

---

## 対応方針

### Phase 1: バックエンド認証委譲

**目的:** Actio の認証処理を Cernere に委譲する。ユーザー管理は Cernere が担当し、Actio はユーザー情報をキャッシュ経由で取得する。

#### 1.1 パッケージ入れ替え

- `packages/id-service/` を削除（Actio ローカルの認証 SDK）
- `packages/id-cache/` を削除（未使用のローカル版）
- `@cernere/id-cache` を npm 依存に追加

#### 1.2 ミドルウェア置換

**現在** (`src/middleware/auth.ts`):
```typescript
import { createUserContext, requireRole } from "@actio/id-service";
```

**移行後:**
```typescript
import { createIdCache, createIdCacheMiddleware } from "@cernere/id-cache";

const idCache = createIdCache({
  idServiceUrl: secretManager.getRequired("CERNERE_URL"),
  jwtSecret: secretManager.get("JWT_SECRET"),
  cacheTtlSeconds: 300,
});

export const userContext = () => createIdCacheMiddleware({
  idCache,
  jwtSecret: secretManager.get("JWT_SECRET"),
  isDev: secretManager.getOrDefault("NODE_ENV", "") !== "production",
});
```

- `getUserId()` / `getUserRole()` は `c.get("userId")` / `c.get("userRole")` で取得（互換性あり）
- `requireRole()` は Actio 側で薄いラッパーとして維持

#### 1.3 認証ルート削除

`src/auth/routes.ts` の以下のエンドポイントを削除:
- `POST /api/auth/register` → Cernere が担当
- `POST /api/auth/login` → Cernere が担当
- `POST /api/auth/refresh` → Cernere が担当
- `POST /api/auth/logout` → Cernere が担当
- `GET /api/auth/google` → Cernere が担当
- `GET /api/auth/google/callback` → Cernere が担当
- `PUT /api/auth/password` → Cernere が担当

以下は Actio 固有なので残す:
- `GET /api/auth/me` → Actio 固有データ（major, groups, projectRoles）を含むため維持。ただしユーザー基本情報は Cernere から取得
- `GET /api/auth/users/list` → グループベースのユーザー一覧は Actio 固有
- `PUT /api/auth/users/:id/role` → Actio のシステムロール管理

#### 1.4 app.ts の変更

```typescript
// 削除: app.route("/api/auth", auth);
// 追加: Actio 固有の認証関連ルートのみマウント
app.route("/api/auth", actioAuthRoutes);  // me, users/list, users/:id/role のみ
```

### Phase 2: DB スキーマ変更

#### 2.1 `users` テーブルの縮小

Cernere がユーザーマスターを持つため、Actio の `users` テーブルは **Actio 固有フィールドのみ** に縮小する。

**削除するカラム:**
- `passwordHash` — Cernere が管理
- `googleId`, `googleAccessToken`, `googleRefreshToken`, `googleTokenExpiresAt`, `googleScopes` — Cernere が管理

**残すカラム:**
- `id` — Cernere の user.id と一致させる
- `name`, `email` — キャッシュ / 表示用（Cernere から同期）
- `role` — Actio 固有のシステムロール（admin / group_leader / general）
- `major` — Actio 固有フィールド
- `calendarAccessId` — Google Calendar 連携 ID（Actio 固有）
- `lastLoginAt`, `createdAt`, `updatedAt`

#### 2.2 `sessions` テーブルの削除

セッション管理は Cernere が担当するため、Actio の `sessions` テーブルは不要になる。

#### 2.3 ユーザー自動同期

Cernere 認証済みリクエストが初めて来た際に、Actio の `users` テーブルにレコードがなければ自動作成する（プロビジョニング）。

```typescript
// ミドルウェアまたは共通処理として
async function ensureLocalUser(userId: string, userRole: string) {
  const existing = await userRepo.findById(userId);
  if (!existing) {
    // Cernere から基本情報を取得して作成
    await userRepo.create({ id: userId, name: "...", email: "...", role: "general" });
  }
}
```

### Phase 3: フロントエンド変更

#### 3.1 認証フロー変更

**現在:** Actio の LoginPage で直接ログイン/登録

**移行後:** Cernere の認証 UI にリダイレクト

```typescript
// LoginPage.tsx → Cernere にリダイレクト
window.location.href = `${CERNERE_URL}/login?redirect=${encodeURIComponent(SCHEDULA_URL)}`;
```

#### 3.2 トークン受け取り

Cernere から戻ってきた際、URL パラメータからトークンを取得:

```typescript
const params = new URLSearchParams(window.location.search);
const accessToken = params.get("accessToken");
const refreshToken = params.get("refreshToken");
if (accessToken && refreshToken) {
  setTokens(accessToken, refreshToken);
  window.history.replaceState({}, "", window.location.pathname);
}
```

#### 3.3 API クライアント変更

`frontend/src/lib/api.ts` の `auth` セクション:
- `register()`, `login()` → 削除（Cernere が担当）
- `logout()` → Cernere のエンドポイントを呼び出し
- `me()` → Actio の `/api/auth/me` を維持
- リフレッシュ処理 → Cernere の `/api/auth/refresh` に変更

#### 3.4 AuthContext 変更

- `login()`, `register()` メソッド → Cernere リダイレクトに変更
- OAuth コールバック処理 → Cernere 経由に統一
- `mfaChallenge` 対応追加（Cernere の MFA フロー）

### Phase 4: ロール体系の整合

| Cernere ロール | Actio ロール | マッピング |
|----------------|-----------------|-----------|
| `admin` (システム) | `admin` | 直接対応 |
| `general` (システム) | `general` | 直接対応 |
| — | `group_leader` | Actio 固有。Cernere の組織ロールとは別に維持 |

- Cernere の `role` はシステムレベルの権限（admin / general）
- Actio の `group_leader` は Actio 固有のロールとして維持
- Cernere の組織 (Organization) ≠ Actio のグループ (Group)。将来的な統合は別途検討

---

## 環境変数の変更

### 追加

| 変数 | 説明 |
|------|------|
| `CERNERE_URL` | Cernere コアサーバーの URL |

### 維持

| 変数 | 説明 |
|------|------|
| `JWT_SECRET` | Cernere と共有。ローカル JWT 検証に使用 |
| `FRONTEND_URL` | フロントエンド URL（コールバック先） |

### 削除候補

| 変数 | 理由 |
|------|------|
| `GOOGLE_CLIENT_ID` | Cernere が OAuth を管理 |
| `GOOGLE_CLIENT_SECRET` | Cernere が OAuth を管理 |
| `GOOGLE_REDIRECT_URI` | Cernere が OAuth を管理 |

> **注意:** Google Calendar 連携（`modules/integrations/`）で Google OAuth トークンを使用している場合は、Cernere 経由でトークンを取得する方法を別途検討する必要がある。

---

## 移行手順（実行順序）

```
Phase 1.1  パッケージ入れ替え (@actio/id-service → @cernere/id-cache)
Phase 1.2  ミドルウェア置換 (auth.ts)
Phase 1.3  認証ルート削除・整理 (auth/routes.ts)
Phase 1.4  app.ts 更新
    ↓
Phase 2.1  users テーブル縮小 (マイグレーション)
Phase 2.2  sessions テーブル削除
Phase 2.3  ユーザー自動プロビジョニング実装
    ↓
Phase 3.1  フロントエンド認証フロー変更
Phase 3.2  トークン受け取り処理
Phase 3.3  API クライアント更新
Phase 3.4  AuthContext 更新
    ↓
Phase 4    ロール体系整合・テスト
```

---

## リスク・検討事項

| リスク | 対策 |
|--------|------|
| 既存ユーザーデータの移行 | Cernere にユーザーを事前登録し、Actio の user.id を Cernere の user.id に揃える |
| Google Calendar 連携の OAuth トークン | Cernere 経由でスコープ付きトークンを取得する仕組みが必要 |
| テスト環境での開発バイパス | `@cernere/id-cache` の `isDev` オプションで `X-User-Id` ヘッダーバイパスを維持 |
| group_leader ロールの扱い | Cernere は `admin` / `general` のみ。Actio 側で独自にロール管理を継続 |
| `appSettings` のトークン TTL 設定 | Cernere 側の設定に統一。Actio の `session.accessTokenMinutes` 等は不要に |
