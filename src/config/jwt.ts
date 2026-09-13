/**
 * JWT Secret configuration.
 * Cernere と共有する JWT シークレットを SecretManager から取得。
 */

import { randomBytes } from "node:crypto";
import { secretManager } from "./secrets.js";

// Local-only sessions may use an ephemeral key; public deployments require injection.
export const JWT_SECRET = secretManager.get("JWT_SECRET") || (secretManager.get("ACTIO_LOCAL_MODE") === "1"
  ? randomBytes(32).toString("hex") : secretManager.getRequired("JWT_SECRET"));

if (JWT_SECRET === "actio-dev-secret-change-in-production" && secretManager.get("ACTIO_LOCAL_MODE") !== "1") {
  throw new Error("Replace the legacy development JWT key through Excubitor");
}
