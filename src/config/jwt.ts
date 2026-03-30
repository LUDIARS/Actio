/**
 * JWT Secret configuration.
 * @schedula/id-service の resolveJwtSecret を使用。
 */

import { resolveJwtSecret } from "../../packages/id-service/src/index.js";
import { secretManager } from "./secrets.js";

export const JWT_SECRET = resolveJwtSecret(secretManager);
