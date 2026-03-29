/**
 * 認証ルート — @schedula/auth パッケージに委譲
 */

import { createAuthRoutes } from "../../packages/auth/src/index.js";
import { JWT_SECRET } from "../config/jwt.js";
import { secretManager } from "../config/secrets.js";
import { getRedis } from "../db/redis.js";
import {
  userRepo,
  userListRepo,
  sessionRepo,
  appSettingsRepo,
  groupMemberRepo,
  groupRepo,
} from "../db/repository.js";
import { logActivity } from "../activity-logger.js";

export const auth = createAuthRoutes({
  jwtSecret: JWT_SECRET,
  secretManager,
  getRedis,
  userRepo,
  userListRepo,
  sessionRepo,
  appSettingsRepo,
  groupMemberRepo,
  groupRepo,
  logActivity,
});
