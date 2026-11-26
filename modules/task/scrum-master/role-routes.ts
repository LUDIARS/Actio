// @spec スクラムマスターの役割と権限
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { localAccessKind } from "../../../src/auth/local-mode.js";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { apiClientRepo } from "../../../src/db/repository.js";
import { PlanningError } from "../planning/contracts.js";
import { AI_SESSION_HEADER, SCRUM_MASTER_SCOPE, aiSessionActor, assignInput } from "./contracts.js";

const base = "/:teamId/planning/scrum-master";
export const scrumMasterRoleRoutes = new Hono();
scrumMasterRoleRoutes.use(base, bodyLimit({ maxSize: 4096 }));

function teamOf(c: Context): string {
  const id = c.req.param("teamId");
  if (!id) throw new PlanningError("対象を指定してください", 400);
  return id;
}

/** 付け外しはチームリーダー (ローカルモードでは持ち主) の操作。サービス経路の代理は受け付けない。 */
function leader(c: Context): { id: string; admin: boolean; audit: string } {
  const id = c.get("actingUserId" as never);
  if (c.get("apiClientId" as never) || typeof id !== "string" || id === "anonymous") {
    throw new PlanningError("チームリーダーが操作してください", 403);
  }
  // 持ち主として操作した AI セッションは、監査でその ID まで追えるようにする。
  const session = localAccessKind(c) === "loopback" ? aiSessionActor(c.req.header(AI_SESSION_HEADER)) : null;
  return { id, admin: c.get("teamRole" as never) === "admin", audit: session ? `${id} (${session})` : id };
}

scrumMasterRoleRoutes.get(base, requireTeamRole("member"), async c => {
  c.header("Cache-Control", "no-store");
  const role = c.get("teamRole" as never);
  const assignment = await planningRepositories().scrumMaster.read(teamOf(c));
  return c.json({
    assignment: assignment && {
      holder: assignment.holder,
      delegate: assignment.clientId === null ? "local-session" as const : "api-client" as const,
      assignedBy: assignment.assignedBy,
      assignedAt: assignment.assignedAt,
    },
    canManage: !c.get("apiClientId" as never) && (role === "leader" || role === "admin"),
  });
});

scrumMasterRoleRoutes.put(base, requireTeamRole("leader"), async c => {
  const actor = leader(c);
  const input = assignInput.parse(await c.req.json().catch(() => null));
  let boundClient: string | null = null;
  if (input.clientId !== null) {
    const client = await apiClientRepo.findByClientId(input.clientId);
    if (!client?.isActive || !Array.isArray(client.scopes) || !client.scopes.includes(SCRUM_MASTER_SCOPE)
      || (!actor.admin && client.userId !== actor.id)) {
      throw new PlanningError("操作できる有効なスクラムマスター用 API クライアントを指定してください", 403);
    }
    boundClient = client.id;
  }
  await planningRepositories().scrumMaster.assign(teamOf(c), boundClient, actor.audit, new Date());
  return c.json({ ok: true });
});

scrumMasterRoleRoutes.delete(base, requireTeamRole("leader"), async c => {
  const actor = leader(c);
  await planningRepositories().scrumMaster.remove(teamOf(c), actor.audit, new Date());
  return c.json({ ok: true });
});
