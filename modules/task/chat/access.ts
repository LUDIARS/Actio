import type { Context } from "hono";
import { isLocalModeRequest } from "../../../src/auth/local-mode.js";
import { isLocalOwnerRequest } from "../../../src/auth/local-owner.js";

export function chatHuman(c: Context): boolean {
  if (c.get("apiClientId" as never)) return false;
  if (isLocalOwnerRequest(c)) return true;
  const id = c.get("userId" as never) as string | undefined;
  return !!id && id !== "anonymous" && id !== "actio-local" && !isLocalModeRequest(c);
}

/** Team middleware still verifies that a local owner's target team exists. */
export function chatAdministrator(c: Context): boolean {
  return chatHuman(c) && (isLocalOwnerRequest(c) || c.get("teamRole" as never) === "admin");
}
