import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isLocalModeRequest } from "../../../src/auth/local-mode.js";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { secretManager } from "../../../src/config/secrets.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { apiClientRepo } from "../../../src/db/repository.js";
import { requireApiKey } from "../../external-api/middleware.js";
import { PlanningError } from "../planning/contracts.js";
import { AUTONOMOUS_SPRINT_SCOPE } from "./access.js";
import { checkSprintBreaker } from "./breaker.js";
import { claimInput, controlInput, enrollInput, releaseInput } from "./contracts.js";
import type { HumanOperator } from "./control-store.js";

const base = "/:teamId/planning/autonomous-sprint";
const dots = base + "/dots";
export const autonomousSprintRoutes = new Hono();
autonomousSprintRoutes.use(base, bodyLimit({ maxSize: 8192 }));
autonomousSprintRoutes.use(base + "/*", bodyLimit({ maxSize: 8192 }));

function operator(c: Context): HumanOperator {
  const id = c.get("actingUserId" as never);
  if (c.get("apiClientId" as never) || isLocalModeRequest(c) || typeof id !== "string" || id === "actio-local" || id === "anonymous") {
    throw new PlanningError("Cernere の人間ログインで操作してください", 403);
  }
  return { id, admin: c.get("teamRole" as never) === "admin" };
}

function authenticatedClient(c: Context): string {
  const id = c.get("apiClientId" as never);
  if (typeof id !== "string" || !id) throw new PlanningError("dots の API キーが必要です", 403);
  return id;
}
function routeId(c: Context, name: "teamId" | "sprintId"): string {
  const id = c.req.param(name);
  if (!id) throw new PlanningError("対象を指定してください", 400);
  return id;
}

autonomousSprintRoutes.get(base, requireTeamRole("member"), async c => {
  c.header("Cache-Control", "no-store");
  const role = c.get("teamRole" as never);
  const canManage = !isLocalModeRequest(c) && (role === "leader" || role === "admin");
  return c.json({ run: await planningRepositories().autonomousControl.read(c.req.param("teamId"), new Date()), canManage });
});

autonomousSprintRoutes.post(base, requireTeamRole("leader"), async c => {
  const actor = operator(c);
  const input = enrollInput.parse(await c.req.json().catch(() => null));
  const client = await apiClientRepo.findByClientId(input.clientId);
  if (!client?.isActive || !Array.isArray(client.scopes) || !client.scopes.includes(AUTONOMOUS_SPRINT_SCOPE)
    || (!actor.admin && client.userId !== actor.id)) {
    throw new PlanningError("操作できる有効な自律スプリント用 API クライアントを指定してください", 403);
  }
  const control = planningRepositories().autonomousControl;
  await control.enroll(c.req.param("teamId"), input.sprintId, client.id, input.stalledAfterMinutes, actor, new Date());
  return c.json({ ok: true }, 201);
});

for (const action of ["pause", "reconcile", "release"] as const) {
  autonomousSprintRoutes.post(base + "/:sprintId/" + action, requireTeamRole("leader"), async c => {
    const actor = operator(c);
    const input = releaseInput.parse(await c.req.json().catch(() => null));
    await planningRepositories().autonomousControl.manual(routeId(c, "teamId"), routeId(c, "sprintId"),
      input.expectedRevision, action, input.reason, actor, new Date());
    return c.json({ ok: true });
  });
}

autonomousSprintRoutes.get(dots, requireApiKey(AUTONOMOUS_SPRINT_SCOPE), async c => {
  c.header("Cache-Control", "no-store");
  const run = await planningRepositories().autonomousControl.read(routeId(c, "teamId"), new Date(), authenticatedClient(c));
  return c.json({ run });
});

autonomousSprintRoutes.post(dots + "/control", requireApiKey(AUTONOMOUS_SPRINT_SCOPE), async c => {
  const input = controlInput.parse(await c.req.json().catch(() => null));
  await planningRepositories().autonomousControl.control(routeId(c, "teamId"), authenticatedClient(c), input, new Date());
  return c.json({ ok: true });
});

autonomousSprintRoutes.post(dots + "/claims", requireApiKey(AUTONOMOUS_SPRINT_SCOPE), async c => {
  const input = claimInput.parse(await c.req.json().catch(() => null));
  const runner = planningRepositories().autonomousRunner;
  const teamId = routeId(c, "teamId"), clientId = authenticatedClient(c);
  const prepared = await runner.claim(teamId, clientId, input.expectedRevision, input.taskId, new Date());
  if (prepared.kind !== "prepare") throw new Error("Missing task claim ticket");
  const verdict = await checkSprintBreaker(secretManager.get("CONCORDIA_URL"), c.req.raw.signal);
  c.req.raw.signal.throwIfAborted();
  const result = await runner.claim(teamId, clientId, input.expectedRevision, input.taskId, new Date(), { ...prepared.ticket, verdict });
  if (result.kind === "blocked") {
    return c.json({ error: result.verdict === "open" ? "Concordia が新規着手を遮断しました" : "Concordia の許可を確認できないため保留しました" },
      result.verdict === "open" ? 409 : 503);
  }
  if (result.kind !== "claimed") throw new Error("Task claim was not persisted");
  return c.json({ claimId: result.claimId, taskId: input.taskId }, 201);
});
