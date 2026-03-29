/**
 * 認証ミドルウェア — @schedula/auth パッケージに委譲
 */

import { requireRole, createUserContext } from "../../packages/auth/src/index.js";
import { JWT_SECRET } from "../config/jwt.js";
import { secretManager } from "../config/secrets.js";

export { requireRole };

/**
 * Extract user context from JWT Bearer token.
 */
export function userContext() {
  return createUserContext(JWT_SECRET, secretManager);
}
