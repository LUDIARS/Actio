// @spec スクラムマスターのフェーズ操作
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secretManager } from "../../../src/config/secrets.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { checkSprintBreaker } from "../autonomous-sprint/breaker.js";
import { PlanningError } from "../planning/contracts.js";
import { gateContext, gateDecision, type GateView } from "../sprint-gates/contracts.js";
import { asScrumMaster } from "./authenticate.js";
import { SCRUM_MASTER_ACTOR, SCRUM_MASTER_HEADER, type ScrumMasterPrincipal } from "./contracts.js";

const base = "/:teamId/planning/sprints/:id/phase";

/**
 * 手動ゲートと同じ URL を、スクラムマスターを名乗る要求にだけ先に引き受ける。
 * 名乗らない要求は後段の人間向け経路へそのまま渡すため、このルートを先に mount する。
 */
export const scrumMasterPhaseRoutes = new Hono();
scrumMasterPhaseRoutes.use(base + "/*", bodyLimit({ maxSize: 131072 }));

type Work = (c: Context, principal: ScrumMasterPrincipal, teamId: string, sprintId: string) => Promise<Response>;

function declared(work: Work): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header(SCRUM_MASTER_HEADER) === undefined) return next();
    const teamId = c.req.param("teamId"), sprintId = c.req.param("id");
    if (!teamId || !sprintId) throw new PlanningError("対象を指定してください", 400);
    return asScrumMaster(c, principal => work(c, principal, teamId, sprintId));
  };
}

const operable = (view: GateView): GateView => ({ ...view, allowedToDecide: !view.autonomous });

scrumMasterPhaseRoutes.get(base, declared(async (c, principal, teamId, sprintId) => {
  const stores = planningRepositories();
  await stores.scrumMaster.verify(teamId, principal);
  c.header("Cache-Control", "no-store");
  return c.json(operable(await stores.gates.view(teamId, sprintId, new Date())));
}));

scrumMasterPhaseRoutes.put(base + "/context", declared(async (c, principal, teamId, sprintId) => {
  const value = gateContext.parse(await c.req.json().catch(() => null));
  const stores = planningRepositories(), now = new Date();
  const view = await stores.gates.context(teamId, sprintId, SCRUM_MASTER_ACTOR, value, now, false,
    stores.scrumMaster.authority(teamId, principal, false, now));
  return c.json(operable(view));
}));

scrumMasterPhaseRoutes.post(base + "/decisions", declared(async (c, principal, teamId, sprintId) => {
  const value = gateDecision.parse(await c.req.json().catch(() => null));
  const stores = planningRepositories();
  await stores.scrumMaster.verify(teamId, principal);
  const input = { ...value, eventId: "sm:" + value.eventId };
  // 反映済みの回答の再送は新しい開始ではないため、遮断照会をせず保存済みの結果を返す。
  let startPermitted = false;
  if (value.action === "approve" && !(await stores.gates.eventOutcome(input.eventId))) {
    const view = await stores.gates.view(teamId, sprintId, new Date());
    if (view.state.phase === "planning" || view.state.phase === "next_planning") {
      const verdict = await checkSprintBreaker(secretManager.get("CONCORDIA_URL"), c.req.raw.signal);
      c.req.raw.signal.throwIfAborted();
      if (verdict !== "allowed") {
        await stores.scrumMaster.recordBlocked(teamId, sprintId, verdict, principal.actor, new Date());
        return c.json({ error: verdict === "open" ? "Concordia が開始を遮断しました" : "Concordia の許可を確認できないため保留しました" },
          verdict === "open" ? 409 : 503);
      }
      startPermitted = true;
    }
  }
  const now = new Date();
  const result = await stores.gates.decide(teamId, sprintId, SCRUM_MASTER_ACTOR, input, now, false,
    stores.scrumMaster.authority(teamId, principal, startPermitted, now));
  if (result.outcome === "rejected") return c.json({ error: result.reason }, 409);
  return c.json(operable(await stores.gates.view(teamId, sprintId, new Date())));
}));
