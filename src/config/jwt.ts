/**
 * JWT Secret configuration.
 * @schedula/auth パッケージの resolveJwtSecret を使用。
 */

import { resolveJwtSecret } from "../../packages/auth/src/index.js";
import { secretManager } from "./secrets.js";

export const JWT_SECRET = resolveJwtSecret(secretManager);
