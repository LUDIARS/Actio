/**
 * @schedula/auth — 依存注入用の型定義
 *
 * auth パッケージはアプリケーション固有のリポジトリ・設定を
 * インターフェース経由で受け取り、再利用可能にする。
 */

import type Redis from "ioredis";

// ─── User ──────────────────────────────────────────────────

/** 認証で必要なユーザー情報の最小インターフェース */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  major?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleTokenExpiresAt?: number | null;
  googleScopes?: string[] | null;
  calendarAccessId?: string | null;
  lastLoginAt?: Date | null;
}

/** ユーザーリポジトリ (認証パッケージが必要とする操作) */
export interface AuthUserRepo {
  findByEmail(email: string): Promise<AuthUser | undefined>;
  findById(id: string): Promise<AuthUser | undefined>;
  findByGoogleId(googleId: string): Promise<AuthUser | undefined>;
  countAll(): Promise<number>;
  create(data: Record<string, unknown>): Promise<void>;
  update(id: string, data: Record<string, unknown>): Promise<void>;
}

/** ユーザー一覧リポジトリ */
export interface AuthUserListRepo {
  findAllBasic(): Promise<AuthUserBasic[]>;
  findByIds(userIds: string[]): Promise<AuthUserBasic[]>;
}

export interface AuthUserBasic {
  id: string;
  name: string;
  email: string;
  role: string;
  major: string | null;
  createdAt: Date;
}

// ─── Session ───────────────────────────────────────────────

export interface AuthSession {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

/** セッションリポジトリ (DB フォールバック用) */
export interface AuthSessionRepo {
  findByRefreshToken(token: string): Promise<AuthSession | undefined>;
  create(data: {
    id: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<void>;
  updateRefreshToken(id: string, refreshToken: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByRefreshToken(token: string): Promise<void>;
}

// ─── Group (ユーザー一覧でグループ情報を付与するため) ──────

export interface AuthGroupMemberRepo {
  findByUserId(userId: string): Promise<Array<{ groupId: string; role: string }>>;
  findByGroupId(groupId: string): Promise<Array<{ userId: string; groupId: string; role: string }>>;
}

export interface AuthGroupRepo {
  findById(id: string): Promise<{ id: string; name: string } | undefined>;
}

// ─── App Settings ──────────────────────────────────────────

export interface AuthAppSettingsRepo {
  findByKey(key: string): Promise<{ key: string; value: string } | undefined>;
}

// ─── Secret Manager ────────────────────────────────────────

export interface AuthSecretManager {
  get(key: string): string | undefined;
  getOrDefault(key: string, defaultValue: string): string;
}

// ─── Redis ─────────────────────────────────────────────────

export type GetRedis = () => Redis | null;

// ─── Activity Logger ───────────────────────────────────────

export type LogActivity = (
  userId: string,
  userName: string,
  action: string,
  detail: string,
) => void;

// ─── Auth Config (パッケージ全体の設定) ────────────────────

export interface AuthConfig {
  /** JWT シークレット */
  jwtSecret: string;
  /** Secret Manager */
  secretManager: AuthSecretManager;
  /** Redis getter (null = Redis 無効) */
  getRedis: GetRedis;
  /** リポジトリ */
  userRepo: AuthUserRepo;
  userListRepo: AuthUserListRepo;
  sessionRepo: AuthSessionRepo;
  appSettingsRepo: AuthAppSettingsRepo;
  groupMemberRepo: AuthGroupMemberRepo;
  groupRepo: AuthGroupRepo;
  /** Activity logger (optional) */
  logActivity?: LogActivity;
}

/** ユーザーロール */
export type UserRole = "admin" | "group_leader" | "general";
