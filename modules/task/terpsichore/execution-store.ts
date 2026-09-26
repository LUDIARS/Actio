import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PlanningError } from "../planning/contracts.js";
import { executionManifest, type ExecutionManifest, type ExecutionRecord } from "@ludiars/terpsichore";

interface ExecutionDatabase { prepare(sql: string): { get(...args: unknown[]): unknown | Promise<unknown>; run(...args: unknown[]): unknown | Promise<unknown> } }
const fields = "id, team_id AS teamId, project_id AS projectId, state, run_id AS runId, task_ids AS taskIdsJson, created_at AS createdAt";
type Row = Omit<ExecutionRecord, "taskIds"> & { taskIdsJson: string };
function decode(row: Row): ExecutionRecord { const { taskIdsJson, ...record } = row; return { ...record, taskIds: z.array(z.string()).parse(JSON.parse(taskIdsJson)) }; }

/** Persist the send intent before invoking Cc so a lost response never triggers an automatic retry. */
export class ExecutionStore {
  constructor(private readonly db: ExecutionDatabase) {}
  async latest(teamId: string, projectId: string): Promise<ExecutionRecord | null> {
    const row = await this.db.prepare(`SELECT ${fields} FROM terpsichore_runs WHERE team_id = ? AND project_id = ?
      ORDER BY CASE WHEN state IN ('submitting', 'running', 'unknown') THEN 0 ELSE 1 END, created_at DESC, id DESC LIMIT 1`).get(teamId, projectId) as Row | undefined;
    return row ? decode(row) : null;
  }
  async reserve(teamId: string, actorId: string, manifest: ExecutionManifest, now: Date): Promise<ExecutionRecord> {
    const row = await this.db.prepare(`INSERT INTO terpsichore_runs(id, team_id, project_id, actor_id, task_ids, manifest_json, state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'submitting', ?) ON CONFLICT DO NOTHING RETURNING ${fields}`)
      .get(randomUUID(), teamId, manifest.projectId, actorId, JSON.stringify(manifest.tasks.map(t => t.id)), JSON.stringify(manifest), now.toISOString()) as Row | undefined;
    if (!row) throw new PlanningError("このプロジェクトは実行中、または受付結果の確認待ちです。状態を確認してください", 409);
    return decode(row);
  }
  async manifest(teamId: string, id: string): Promise<ExecutionManifest> {
    const row = await this.db.prepare("SELECT manifest_json AS manifestJson FROM terpsichore_runs WHERE id = ? AND team_id = ?").get(id, teamId) as { manifestJson: string } | undefined;
    if (!row) throw new PlanningError("委託が見つかりません", 404);
    return executionManifest.parse(JSON.parse(row.manifestJson));
  }
  async observe(id: string, runId: string | null, state: ExecutionRecord["state"]): Promise<void> {
    await this.db.prepare("UPDATE terpsichore_runs SET run_id = ?, state = ? WHERE id = ? AND state IN ('submitting', 'running', 'unknown')").run(runId, state, id);
  }
}
