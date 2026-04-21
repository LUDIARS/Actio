/**
 * Actio Module SDK — 型定義
 *
 * モジュール作者はこれらの型を実装し、`defineModule()` で統合する。
 */

import type { Hono } from "hono";
import type { z } from "zod";

// ─── Manifest ────────────────────────────────────────────────

/** ユーザーデータカラムの型定義 (Cernere project_schema に変換される) */
export type UserDataColumnType = "text" | "boolean" | "integer" | "json" | "timestamp";

export interface UserDataColumn {
  /** 型 */
  type: UserDataColumnType;
  /** 説明 (admin UI に表示) */
  description?: string;
  /** デフォルト値 (Cernere 未接続時のフォールバック) */
  defaultValue?: unknown;
  /** JSON 型のバリデーション用 (任意) */
  schema?: z.ZodTypeAny;
  /** ユーザが opt-out 時に完全削除するか (デフォルト true) */
  purgeOnOptout?: boolean;
}

/** モジュールの適用スコープ */
export type ModuleScope = "global" | "per-group" | "per-user";

/** ドリズルテーブル (最小限のダック型) */
export interface DrizzleTableLike {
  _: { name: string };
}

export interface ModuleManifest {
  /** モジュールID (URL-safe, 英小文字とハイフン) */
  id: string;
  /** 人間可読な名前 */
  name: string;
  /** 短い説明 */
  description?: string;
  /** パッケージバージョン (自動注入される、手動指定不要) */
  version?: string;
  /** Actio API 互換バージョン (semver range) */
  schedulaApiVersion: string;
  /** 他モジュールへの依存 (モジュールID 配列) */
  depends?: string[];
  /** 適用スコープ */
  scope: ModuleScope;
}

// ─── Context (ホストから注入) ────────────────────────────────

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** ユーザー識別情報へのアクセス (Cernere 経由、Redis cache 付き) */
export interface UserIdentityApi {
  get(userId: string): Promise<UserIdentity>;
  getMany(userIds: string[]): Promise<Map<string, UserIdentity>>;
}

/** ユーザーデータアクセス (Cernere project_data proxy) */
export interface UserDataApi {
  get<T = unknown>(userId: string, key: string): Promise<T | null>;
  set(userId: string, key: string, value: unknown): Promise<void>;
  delete(userId: string, key: string): Promise<void>;
}

/** OAuth トークンストレージ (Cernere project_oauth_tokens proxy)
 *
 * 個人データ保管禁止ルールに基づき、モジュールは OAuth トークンを自前で
 * 保管せず Cernere に預ける。`provider` は "google" / "notion" / "github" など任意の文字列。
 */
export interface OAuthToken {
  provider: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  tokenType: string | null;
  scope: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthTokenInput {
  provider: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OAuthApi {
  store(userId: string, input: OAuthTokenInput): Promise<{ ok: true; provider: string }>;
  get(userId: string, provider: string): Promise<OAuthToken | null>;
  list(userId: string): Promise<OAuthToken[]>;
  delete(userId: string, provider: string): Promise<{ ok: true; deleted: boolean }>;
}

/** WebSocket ブロードキャスト */
export interface WsApi {
  /** 特定グループの全メンバーに通知 */
  broadcastToGroup(groupId: string, event: string, payload: unknown, excludeUserId?: string): Promise<void>;
  /** 特定ユーザーに通知 */
  relayToUser(userId: string, event: string, payload: unknown): Promise<void>;
}

/** シークレット (モジュールID で prefix 強制) */
export interface SecretsApi {
  get(key: string): string | undefined;
  getOrDefault(key: string, fallback: string): string;
}

/** 監査ログ */
export type AuditLogFn = (userId: string, action: string, detail: string) => void;

/** Module 間呼び出し (依存宣言済みのみ) */
export interface ModulesApi {
  invoke<T = unknown>(moduleId: string, command: string, payload: unknown): Promise<T>;
}

/** DB アクセス (モジュールのテーブル所有権を enforce)
 *
 *  **ホスト側の実装要件 (Issue #111 S3 / Actio 2026-04-21 以降)**:
 *  - `definition.tables` に宣言されたテーブル **以外**に対して
 *    `select/insert/update/delete` が呼ばれた時点で throw する。
 *  - `definition.tables` が空の場合は raw 経由の CRUD を全拒否する。
 *  - SQL template (`sql\`...\``) は引き続き使える (検知困難なため)
 *    が、本番では module 毎に読み取り専用 role を割り当てる方針
 *    (Phase 2)。
 *
 *  モジュール作者は `db.select().from(myTable)` 等の Drizzle 通常 API
 *  をそのまま使える。型としては unknown のまま — 具体化は受け側で。
 */
export interface DbApi {
  readonly raw: unknown;
}

/** WS コマンドに課せる認可ロール (Issue #111 S1). */
export type WsRequiredRole =
  | "system_admin"
  | "group_owner"
  | "group_leader"
  | "group_member";

/** WS コマンド宣言 — 認証/認可を宣言的に指定する.
 *
 *  既存の `WsCommandHandler` 直代入も引き続きサポート (後方互換):
 *    - `wsCommands: { action: async (u,p,c) => ... }`            → 認証必須で扱う
 *    - `wsCommands: { action: { handler, requireAuth: false } }` → 匿名許可 (ログイン画面前のコマンド等)
 *    - `wsCommands: { action: { handler, requireRole: "system_admin" } }` → admin のみ
 */
export interface WsCommandDefinition<P = unknown, R = unknown> {
  handler: WsCommandHandler<P, R>;
  /** 既定 `true`. `false` にすると dispatcher が空/匿名 userId を通す. */
  requireAuth?: boolean;
  /** 必要ロール. 指定時は userRole が一致しないと dispatcher が reject する. */
  requireRole?: WsRequiredRole;
}

export type WsCommandEntry<P = unknown, R = unknown> =
  | WsCommandHandler<P, R>
  | WsCommandDefinition<P, R>;

/** 権限チェック用 ミドルウェア群 */
export interface PermissionsApi {
  requireSystemAdmin(): (c: unknown, next: () => Promise<unknown>) => Promise<unknown>;
  requireGroupRole(
    role: "owner" | "leader" | "member",
  ): (c: unknown, next: () => Promise<unknown>) => Promise<unknown>;
}

export interface ModuleContext {
  /** モジュールID */
  readonly moduleId: string;
  /** ユーザー識別 (name, email, role) */
  readonly users: UserIdentityApi;
  /** ユーザーデータ (Cernere proxy) */
  readonly userData: UserDataApi;
  /** OAuth トークン (Cernere proxy) */
  readonly oauth: OAuthApi;
  /** DB */
  readonly db: DbApi;
  /** WS */
  readonly ws: WsApi;
  /** シークレット */
  readonly secrets: SecretsApi;
  /** 監査ログ */
  readonly audit: AuditLogFn;
  /** 他モジュール呼び出し */
  readonly modules: ModulesApi;
  /** 権限 */
  readonly permissions: PermissionsApi;
}

// ─── Module 実装 ─────────────────────────────────────────────

/** WS コマンドハンドラ */
export type WsCommandHandler<P = unknown, R = unknown> = (
  userId: string,
  payload: P,
  ctx: ModuleContext,
) => Promise<R>;

/** REST routes ファクトリ (Hono app を受け取り、ルート登録) */
export type RoutesFactory = (app: Hono, ctx: ModuleContext) => void | Promise<void>;

/** ライフサイクルフック */
export interface Lifecycle {
  onInstall?: (ctx: ModuleContext) => Promise<void> | void;
  onUninstall?: (ctx: ModuleContext) => Promise<void> | void;
  onEnable?: (ctx: ModuleContext, scope: string) => Promise<void> | void;
  onDisable?: (ctx: ModuleContext, scope: string) => Promise<void> | void;
  /** ユーザーが opt-out した場合にモジュール所有データを削除 */
  onUserOptout?: (ctx: ModuleContext, userId: string) => Promise<void> | void;
}

export interface ModuleDefinition extends ModuleManifest, Lifecycle {
  /** モジュール所有の Drizzle テーブル (ホストがスキーマを合成する) */
  tables?: Record<string, DrizzleTableLike>;
  /** 宣言したユーザーデータカラム (Cernere project_schema に登録) */
  userData?: Record<string, UserDataColumn>;
  /** REST routes (`/api/{basePath}` にマウント) */
  basePath?: string;
  routes?: RoutesFactory;
  /** WS commands (module 名は this.id で固定、action のみ指定).
   *
   *  値は bare handler もしくは `WsCommandDefinition` を受け付ける
   *  (Issue #111 S1: requireAuth / requireRole の宣言的制御). */
  wsCommands?: Record<string, WsCommandEntry>;
  /** フロントエンド module federation remote entry のパス (relative to package root) */
  client?: {
    remoteEntry: string;
  };
}
