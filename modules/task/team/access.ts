import type { Context } from "hono";
import { taskRepo } from "../../../src/db/repository.js";
import { isLocalOwnerRequest, resolveLocalOwnerTeamRole } from "../../../src/auth/local-owner.js";
import { resolveUserId } from "../personal.js";

/** Reuse the verified local owner's team role without granting it to another assignee. */
export async function canActAsTeamMember(c: Context, teamId: string, userId: string): Promise<boolean> {
  if (isLocalOwnerRequest(c) && userId === resolveUserId(c)) {
    return (await resolveLocalOwnerTeamRole(teamId)) !== undefined;
  }
  return taskRepo.isTeamMember(teamId, userId);
}
