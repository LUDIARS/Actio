/**
 * 認証ミドルウェア — @schedula/id-service に委譲
 */

import { requireRole, createUserContext } from "../../packages/id-service/src/index.js";
import { JWT_SECRET } from "../config/jwt.js";
import { secretManager } from "../config/secrets.js";

export { requireRole };

export function userContext() {
  return createUserContext(JWT_SECRET, secretManager);
}
