// 既存タスクのプロジェクト整合を直す移行スクリプト (dry-run 既定)
// spec/feature/task-integration/spec.md §6.6
//
// 同期 tick は Cc 側の「変化」しかタスクへ波及させないため、 それ以前から残るずれ
// (旧 code を指すタスク / チームがあるのに teamId 空のタスク) を一覧にする。
// 読み取りは Actio と Cc の HTTP API だけ。 DB へ直接は触らない。
//
// 使い方:
//   npx tsx scripts/cc-project-backfill.ts                     # dry-run (既定。 一覧を書くだけ)
//   npx tsx scripts/cc-project-backfill.ts --rename LwP=LP     # Cc が renamed_from を出す前の改名を指定
//   npx tsx scripts/cc-project-backfill.ts --out <path>        # 一覧の出力先 (既定 logs/cc-project-backfill-<時刻>.json)
//   npx tsx scripts/cc-project-backfill.ts --apply             # 人が一覧を確認したあとで Actio API (PATCH) へ反映
//
// env:
//   ACTIO_BASE      Actio API (必須。 ポートは Excubitor catalog が正本)
//   CONCORDIA_URL   Cc API (任意。 あれば renamed_from を読む)
//   ACTIO_TOKEN     --apply 時の Bearer トークン (任意)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { planProjectBackfill, type BackfillProject, type BackfillTask } from "../modules/task/team/cc-project-backfill-plan.js";
import { parseCcProjects } from "../modules/task/team/cc-project-parse.js";
import { planProjectRenames, type ProjectRename } from "../modules/task/team/cc-project-plan.js";

interface ActioTask extends BackfillTask {
  title: string;
  status: string;
}

function argValue(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  });
  return values;
}

function parseRenameArgs(): ProjectRename[] {
  return argValue("--rename").map((pair) => {
    const [from, to] = pair.split("=");
    if (!from || !to || from === to) throw new Error(`--rename は OLD=NEW の形で指定します: ${pair}`);
    return { from, to };
  });
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname} -> ${response.status}`);
  return response.json();
}

// GET /api/tasks は要約をページ分けして返す (spec/feature/task-list-api.md)。 nextCursor を辿って全件読む
async function listAllTasks(actioBase: string): Promise<ActioTask[]> {
  const tasks: ActioTask[] = [];
  let cursor: string | null = null;
  do {
    const query = `scope=all&kind=all&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await getJson(`${actioBase}/api/tasks?${query}`) as { tasks: ActioTask[]; nextCursor?: string | null };
    tasks.push(...page.tasks);
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return tasks;
}

async function readCcRenames(): Promise<ProjectRename[]> {
  const baseUrl = (process.env.CONCORDIA_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) return [];
  const projects = parseCcProjects(await getJson(`${baseUrl}/v1/project-codes/admin`));
  if (projects === null) throw new Error("Cc /v1/project-codes/admin の応答形が想定外です");
  return planProjectRenames(projects);
}

async function patchTask(actioBase: string, taskId: string, body: Record<string, string>): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ACTIO_TOKEN) headers.authorization = `Bearer ${process.env.ACTIO_TOKEN}`;
  const response = await fetch(`${actioBase}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`PATCH task ${taskId} -> ${response.status}`);
}

async function main(): Promise<void> {
  const actioBase = (process.env.ACTIO_BASE ?? "").replace(/\/+$/, "");
  if (!actioBase) throw new Error("ACTIO_BASE を指定してください (ポートは Excubitor catalog を参照)");
  const apply = process.argv.includes("--apply");

  const { projects } = await getJson(`${actioBase}/api/projects/cc`) as { projects: BackfillProject[] };
  const tasks = await listAllTasks(actioBase);
  const renames = [...parseRenameArgs(), ...await readCcRenames()];
  const plan = planProjectBackfill(tasks, projects, renames);

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const describe = <T extends { taskId: string }>(rows: T[]) => rows.map((row) => ({
    ...row, title: byId.get(row.taskId)?.title ?? "", status: byId.get(row.taskId)?.status ?? "",
  }));
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    renameMap: renames,
    renames: describe(plan.renames),
    teamBindings: describe(plan.teamBindings),
    multiTeam: describe(plan.multiTeam),
  };
  const out = argValue("--out")[0] ?? join("logs", `cc-project-backfill-${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[cc-project-backfill] mode=${report.mode} renames=${plan.renames.length} teamBindings=${plan.teamBindings.length} multiTeam=${plan.multiTeam.length}`);
  console.log(`[cc-project-backfill] 一覧: ${out}`);
  if (!apply) return;

  for (const row of plan.renames) await patchTask(actioBase, row.taskId, { projectId: row.to });
  for (const row of plan.teamBindings) await patchTask(actioBase, row.taskId, { teamId: row.teamId });
  console.log("[cc-project-backfill] 反映しました。 multiTeam は人が選んで個別に更新してください");
}

main().catch((error: unknown) => {
  console.error(`[cc-project-backfill] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
