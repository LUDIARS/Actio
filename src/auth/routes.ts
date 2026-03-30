/**
 * 認証ルート — @schedula/id-service に委譲
 */

import { createAuthRoutes, pluginRegistry } from "../../packages/id-service/src/index.js";
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
import { registerSchedulaPlugin } from "../plugins/schedula.js";

// Schedula プラグインを登録
registerSchedulaPlugin(pluginRegistry);

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
  pluginRegistry,
});
