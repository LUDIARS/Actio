import { Hono } from "hono";
import { z } from "zod";
import { dialect } from "../../../src/db/connection.js";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { newSprint, sprintChange, groupInput, orderInput, PlanningError, PLANNING_UNSUPPORTED_MESSAGE } from "./contracts.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { sprintImpact } from "./impact.js";
import { praeformaRoutes } from "./spec-routes.js";
import { suggestGroups } from "./group-suggestions.js";
import { sprintNotification } from "../notifications/events.js";
import { enqueueNotificationsSafely } from "../notifications/enqueue.js";

export const planningRoutes = new Hono();
planningRoutes.use("/:teamId/planning/*", async (c, next) => {
  if (dialect === "mysql") return c.json({ error: PLANNING_UNSUPPORTED_MESSAGE }, 501);
  await next();
});
planningRoutes.onError((error, c) => {
  if (error instanceof PlanningError) return c.json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return c.json({ error: error.issues.map(i => i.message).join("; ") }, 400);
  throw error;
});
const planningStores = planningRepositories;
planningRoutes.get("/:teamId/planning", requireTeamRole("member"), async (c) => {
  if (dialect === "mysql") return c.json({ error: PLANNING_UNSUPPORTED_MESSAGE }, 501);
  const teamId = c.req.param("teamId");
  const { sprints, backlog } = planningStores();
  const tasks = await backlog.list(teamId);
  return c.json({ tasks, groups: await backlog.groups(teamId), suggestions: suggestGroups(tasks), sprints: (await sprints.list(teamId)).map(s => ({ ...s, impact: sprintImpact(s, tasks) })) });
});
planningRoutes.post("/:teamId/planning/sprints", requireTeamRole("leader"), async c => {
  const input = newSprint.parse(await c.req.json().catch(() => null));
  return c.json({ sprint: await planningStores().sprints.create(c.req.param("teamId"), c.get("actingUserId" as never) as string, input, new Date()) }, 201);
});
planningRoutes.patch("/:teamId/planning/sprints/:id", requireTeamRole("leader"), async c => {
  const input = sprintChange.parse(await c.req.json().catch(() => null));
  const sprint = await planningStores().sprints.change(c.req.param("teamId"), c.req.param("id"), c.get("actingUserId" as never) as string, input, new Date());
  if (input.action === "start" || input.action === "close") {
    await enqueueNotificationsSafely([sprintNotification(input.action === "start" ? "started" : "closed", sprint)]);
  }
  return c.json({ sprint });
});
planningRoutes.get("/:teamId/planning/sprints/:id/history", requireTeamRole("member"), async c =>
  c.json({ changes: await planningStores().sprints.history(c.req.param("teamId"), c.req.param("id")) }));
planningRoutes.post("/:teamId/planning/groups", requireTeamRole("leader"), async c => {
  const input = groupInput.parse(await c.req.json().catch(() => null));
  return c.json({ id: await planningStores().backlog.group(c.req.param("teamId"), c.get("actingUserId" as never) as string, input, new Date()) }, 201);
});
planningRoutes.delete("/:teamId/planning/groups/:id", requireTeamRole("leader"), async c => {
  await planningStores().backlog.ungroup(c.req.param("teamId"), c.req.param("id"));
  return c.json({ ok: true });
});
planningRoutes.put("/:teamId/planning/order", requireTeamRole("leader"), async c => {
  const input = orderInput.parse(await c.req.json().catch(() => null));
  await planningStores().backlog.reorder(c.req.param("teamId"), input.taskIds);
  return c.json({ ok: true });
});
planningRoutes.route("/", praeformaRoutes);
