// @spec スプリントフェーズの本人認証
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { isLocalModeRequest } from "../../../src/auth/local-mode.js";
import { PlanningError } from "../planning/contracts.js";
import type { Context } from "hono";
function param(c: Context, name: string): string {
    const value = c.req.param(name);
    if (!value)
        throw new PlanningError("Missing route parameter", 400);
    return value;
}
function human(c: Context): boolean { const id = c.get("userId" as never); return !c.get("apiClientId" as never) && !isLocalModeRequest(c) && typeof id === "string" && id !== "anonymous" && id !== "actio-local"; }
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { gateContext, gateDecision, type GateView } from "./contracts.js";
const base = "/:teamId/planning/sprints/:id/phase";
export const sprintGateRoutes = new Hono();
sprintGateRoutes.use(base + "/*", bodyLimit({ maxSize: 131072 }));
sprintGateRoutes.get(base, requireTeamRole("member"), async (c) => {
    const view = await planningRepositories().gates.view(param(c, "teamId"), param(c, "id"), new Date());
    return c.json({ ...view, allowedToDecide: human(c) && ["leader", "admin"].includes(c.get("teamRole" as never) as string) } satisfies GateView);
});
sprintGateRoutes.use(base + "/*", async (c, next) => {
    if (!human(c))
        return c.json({ error: "人間のログインで操作してください。サービスの X-Decided-By はフェーズ承認に使えません" }, 403);
    await next();
});
sprintGateRoutes.put(base + "/context", requireTeamRole("leader"), async (c) => {
    const value = gateContext.parse(await c.req.json().catch(() => null));
    const view = await planningRepositories().gates.context(param(c, "teamId"), param(c, "id"), c.get("actingUserId" as never) as string, value, new Date(), c.get("teamRole" as never) !== "admin");
    return c.json({ ...view, allowedToDecide: true });
});
sprintGateRoutes.post(base + "/decisions", requireTeamRole("leader"), async (c) => {
    const value = gateDecision.parse(await c.req.json().catch(() => null));
    const store = planningRepositories().gates, teamId = param(c, "teamId"), id = param(c, "id");
    const result = await store.decide(teamId, id, c.get("actingUserId" as never) as string, { ...value, eventId: "ui:" + value.eventId }, new Date(), c.get("teamRole" as never) !== "admin");
    if (result.outcome === "rejected")
        return c.json({ error: result.reason }, 409);
    return c.json({ ...await store.view(teamId, id, new Date()), allowedToDecide: true });
});
