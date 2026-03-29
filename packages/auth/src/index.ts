/**
 * @schedula/auth — 認証パッケージ
 *
 * JWT認証、セッション管理、Google OAuth、ミドルウェアを
 * 再利用可能なパッケージとして提供する。
 */

// Types
export type {
  AuthUser,
  AuthUserRepo,
  AuthUserListRepo,
  AuthUserBasic,
  AuthSession,
  AuthSessionRepo,
  AuthGroupMemberRepo,
  AuthGroupRepo,
  AuthAppSettingsRepo,
  AuthSecretManager,
  GetRedis,
  LogActivity,
  AuthConfig,
  UserRole,
} from "./types.js";

// JWT
export { resolveJwtSecret } from "./jwt.js";

// Session Store
export { createSessionStore } from "./session-store.js";
export type { SessionData, SessionStore } from "./session-store.js";

// Middleware
export { requireRole, createUserContext } from "./middleware.js";

// Helpers
export { getUserId, getUserRole } from "./helpers.js";

// Routes
export { createAuthRoutes } from "./routes.js";
