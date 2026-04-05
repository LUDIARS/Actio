/**
 * JWT Secret configuration.
 * Cernere と共有する JWT シークレットを SecretManager から取得。
 */

import { secretManager } from "./secrets.js";

export const JWT_SECRET = secretManager.getOrDefault("JWT_SECRET", "schedula-dev-secret-change-in-production");
