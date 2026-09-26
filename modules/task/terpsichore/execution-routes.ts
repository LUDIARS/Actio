import { Hono } from "hono";
import { z } from "zod";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { secretManager } from "../../../src/config/secrets.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { PlanningError } from "../planning/contracts.js";
import { executionStart, type ExecutionRecord } from "@ludiars/terpsichore";
import { guidanceInput } from "@ludiars/terpsichore";
import { assessGuidance } from "./guidance.js";
import { buildExecutionManifest, executionCandidates } from "@ludiars/terpsichore";
import { executionPrompt } from "./execution-prompt.js";
import { ConcordiaExecutionClient, ConcordiaExecutionError } from "@ludiars/terpsichore";

const base = "/:teamId/planning/terpsichore/execution";
export const executionRoutes = new Hono();
function client(): ConcordiaExecutionClient { return new ConcordiaExecutionClient(secretManager.get("CONCORDIA_URL")); }
function state(status: string): ExecutionRecord["state"] {
  return status === "completed" ? "completed" : ["failed", "spawn_failed", "cancelled"].includes(status) ? "failed" : "running";
}
async function executionSource(teamId: string, projectId: string) {
  const stores = planningRepositories();
  const saved = await stores.guidance.load(teamId, projectId, null);
  if (!saved) throw new PlanningError("対象プロジェクトの全スプリント支援計画を先に保存してください", 409);
  const [tasks, sprints] = await Promise.all([stores.backlog.list(teamId), stores.sprints.list(teamId)]);
  const report = assessGuidance(guidanceInput.parse(saved.input), tasks, sprints, new Date());
  return { saved, report, selected: executionCandidates(tasks, report) };
}
executionRoutes.onError((error, c) => {
  if (error instanceof ConcordiaExecutionError) return c.json({ error: error.message }, error.status);
  if (error instanceof PlanningError) return c.json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return c.json({ error: "委託の入力またはCc応答が契約と一致しません" }, 400);
  throw error;
});
executionRoutes.get(`${base}/templates`, requireTeamRole("leader"), async c => c.json({ templates: await client().listTemplates() }));
executionRoutes.get(`${base}/preview`, requireTeamRole("leader"), async c => {
  const projectId = z.string().min(1).max(120).parse(c.req.query("projectId"));
  const { saved, report, selected } = await executionSource(c.req.param("teamId"), projectId);
  return c.json({ planRevision: saved.revision, sourceFingerprint: report.sourceFingerprint, tasks: selected.map(t => ({ id: t.id, title: t.title })) });
});
executionRoutes.get(`${base}/:id/manifest`, requireTeamRole("member"), async c => c.json(await planningRepositories().executions.manifest(c.req.param("teamId"), c.req.param("id"))));
executionRoutes.post(base, requireTeamRole("leader"), async c => {
  const input = executionStart.parse(await c.req.json().catch(() => null));
  const teamId = c.req.param("teamId"), stores = planningRepositories();
  const { saved, report, selected } = await executionSource(teamId, input.projectId);
  if (saved.revision !== input.planRevision) throw new PlanningError("支援計画が更新されています。保存済み計画を読み直してください", 409);
  if (report.sourceFingerprint !== input.sourceFingerprint) throw new PlanningError("タスクかスプリントが変更されています。再評価してください", 409);
  if (!selected.length) throw new PlanningError("定義と依存が揃った未着手のAIタスクがありません", 409);
  const cc = client(), target = await cc.resolve(input.projectId, input.callName);
  const actorId = c.get("actingUserId" as never) as string;
  const manifest = buildExecutionManifest(saved.input, saved.revision, selected, report);
  const record = await stores.executions.reserve(teamId, actorId, manifest, new Date());
  const prompt = executionPrompt(teamId, input.projectId, record.id, actorId);
  try {
    const run = await cc.invoke(input.callName, target, prompt, `terpsichore:${record.id}`);
    await stores.executions.observe(record.id, run.id, state(run.status));
    return c.json({ execution: { ...record, runId: run.id, state: state(run.status) } }, 202);
  } catch {
    // A send may have succeeded upstream even when its response was lost. Never retry here.
    await stores.executions.observe(record.id, null, "unknown");
    return c.json({ error: "Ccの受付結果が未確定です。再送せず実行状態を確認してください", execution: { ...record, state: "unknown" } }, 502);
  }
});
executionRoutes.get(base, requireTeamRole("member"), async c => {
  const projectId = z.string().min(1).max(120).parse(c.req.query("projectId"));
  const stores = planningRepositories(), teamId = c.req.param("teamId");
  let execution = await stores.executions.latest(teamId, projectId);
  if (!execution) return c.json({ execution: null, remainingTaskIds: [], remoteStatus: null });
  let remoteStatus: string | null = null;
  if (["submitting", "running", "unknown"].includes(execution.state)) {
    const cc = client();
    const initial = execution.runId ? { id: execution.runId } : await cc.recover(`terpsichore:${execution.id}`);
    const run = initial ? await cc.followContinuations(initial.id) : null;
    remoteStatus = run?.status ?? "unknown";
    const next = run ? state(run.status) : "unknown";
    await stores.executions.observe(execution.id, run?.id ?? execution.runId, next);
    execution = { ...execution, runId: run?.id ?? execution.runId, state: next };
  }
  const tasks = new Map((await stores.backlog.list(teamId)).map(t => [t.id, t]));
  return c.json({ execution, remoteStatus, remainingTaskIds: execution.taskIds.filter(id => tasks.get(id)?.status !== "done") });
});
