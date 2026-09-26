import { PlanningError } from "../planning/contracts.js";
import { guidanceInput, type GuidanceInput } from "@ludiars/terpsichore";

interface PlanDatabase {
  prepare(sql: string): { get(...args: unknown[]): unknown | Promise<unknown> };
}
interface PlanRow { revision: number; inputJson: string; updatedAt: string }
export interface SavedGuidance { revision: number; input: GuidanceInput; updatedAt: string }

/** One scoped definition document; task state and sprint membership stay in their existing stores. */
export class GuidancePlanStore {
  constructor(private readonly db: PlanDatabase) {}
  private key(projectId: string | null, sprintId: string | null): string { return JSON.stringify([projectId, sprintId]); }
  async load(teamId: string, projectId: string | null, sprintId: string | null): Promise<SavedGuidance | null> {
    const row = await this.db.prepare("SELECT revision, input_json AS inputJson, updated_at AS updatedAt FROM terpsichore_plans WHERE team_id = ? AND scope_key = ?")
      .get(teamId, this.key(projectId, sprintId)) as PlanRow | undefined;
    return row ? { revision: row.revision, input: guidanceInput.parse(JSON.parse(row.inputJson)), updatedAt: row.updatedAt } : null;
  }
  async save(teamId: string, actorId: string, input: GuidanceInput, revision: number, now: Date): Promise<SavedGuidance> {
    const key = this.key(input.projectId, input.sprintId), json = JSON.stringify(input), date = now.toISOString();
    const returned = " RETURNING revision, input_json AS inputJson, updated_at AS updatedAt";
    const row = (revision === 0
      ? await this.db.prepare("INSERT INTO terpsichore_plans(team_id, scope_key, input_json, revision, actor_id, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(team_id, scope_key) DO NOTHING" + returned).get(teamId, key, json, actorId, date)
      : await this.db.prepare("UPDATE terpsichore_plans SET input_json = ?, revision = revision + 1, actor_id = ?, updated_at = ? WHERE team_id = ? AND scope_key = ? AND revision = ?" + returned).get(json, actorId, date, teamId, key, revision)) as PlanRow | undefined;
    if (!row) throw new PlanningError("支援計画が他で更新されています。再読み込みして内容を確認してください", 409);
    return { revision: row.revision, input: guidanceInput.parse(JSON.parse(row.inputJson)), updatedAt: row.updatedAt };
  }
}
