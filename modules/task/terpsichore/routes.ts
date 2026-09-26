import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { secretManager } from "../../../src/config/secrets.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { PlanningError } from "../planning/contracts.js";
import { guidanceInput, type GuidanceInput, type GuidanceReport } from "@ludiars/terpsichore";
import { assessGuidance } from "./guidance.js";
import { GeniusAdviceError, retrieveAdvice } from "@ludiars/terpsichore";
import { executionRoutes } from "./execution-routes.js";

const base = "/:teamId/planning/terpsichore";
export const terpsichoreRoutes = new Hono();
terpsichoreRoutes.use(`${base}/*`, bodyLimit({ maxSize: 1_048_576 }));
terpsichoreRoutes.route("/", executionRoutes);
const scopeSchema = z.object({ projectId: z.string().min(1).max(200).optional(), sprintId: z.string().min(1).max(200).optional() }).strict();
const saveSchema = z.object({ input: guidanceInput, revision: z.number().int().min(0), sourceFingerprint: z.string().min(1) }).strict();

async function assessment(teamId: string, input: GuidanceInput): Promise<GuidanceReport> {
  const stores = planningRepositories();
  const [tasks, sprints] = await Promise.all([stores.backlog.list(teamId), stores.sprints.list(teamId)]);
  return assessGuidance(input, tasks, sprints, new Date());
}

terpsichoreRoutes.get(`${base}/plan`, requireTeamRole("member"), async c => {
  const query = scopeSchema.parse(c.req.query());
  const saved = await planningRepositories().guidance.load(c.req.param("teamId"), query.projectId ?? null, query.sprintId ?? null);
  const input = saved?.input ?? guidanceInput.parse({ projectId: query.projectId ?? null, sprintId: query.sprintId ?? null,
    goal: { audience: "", outcome: "", successSignal: "" }, checkpoints: [], definitions: [], deferred: [] });
  try { return c.json({ plan: saved, input, report: await assessment(c.req.param("teamId"), input), warning: null }); }
  catch (error) {
    // Keep stale definitions editable when referenced tasks were moved or removed.
    if (saved && error instanceof PlanningError) return c.json({ plan: saved, input, report: null, warning: error.message });
    throw error;
  }
});
terpsichoreRoutes.post(`${base}/assess`, requireTeamRole("member"), async c => {
  const input = guidanceInput.parse(await c.req.json().catch(() => null));
  return c.json({ report: await assessment(c.req.param("teamId"), input) });
});
terpsichoreRoutes.put(`${base}/plan`, requireTeamRole("leader"), async c => {
  const value = saveSchema.parse(await c.req.json().catch(() => null));
  const report = await assessment(c.req.param("teamId"), value.input);
  if (report.sourceFingerprint !== value.sourceFingerprint) throw new PlanningError("バックログかスプリントが変わっています。再評価してから保存してください", 409);
  const plan = await planningRepositories().guidance.save(c.req.param("teamId"), c.get("actingUserId" as never) as string, value.input, value.revision, new Date());
  return c.json({ plan, report });
});
terpsichoreRoutes.post(`${base}/advice`, requireTeamRole("leader"), async c => {
  const input = guidanceInput.parse(await c.req.json().catch(() => null));
  const report = await assessment(c.req.param("teamId"), input);
  try { return c.json({ cards: await retrieveAdvice(report, secretManager.get("GENIUS_URL"), secretManager.get("GENIUS_TOKEN")) }); }
  catch (error) { if (error instanceof GeniusAdviceError) return c.json({ error: error.message }, error.status); throw error; }
});
