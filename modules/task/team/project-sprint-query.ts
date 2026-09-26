/**
 * Cc プロジェクト別スプリント集計の読み出し (spec/feature/task-integration/spec.md §6.4)。
 * Cc 同期キャッシュ (project_refs) の teamIds から各チームのスプリントとバックログを読み、 集計関数へ渡す。
 * 読み取り専用。 計画機能を持つ方言 (PostgreSQL / SQLite) でだけ呼ぶ。
 */

import { projectRefRepo, teamRefRepo } from "../../../src/db/repository.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import {
  summarizeProjectSprints,
  type ProjectSprintSummary,
  type ProjectSprintTeamInput,
} from "../planning/project-sprint-summary.js";

/** `GET /api/projects/cc` に出ない code (未知、 または Cc から消えて removed_at 付き) は null。 */
export async function queryProjectSprints(code: string, now: Date): Promise<ProjectSprintSummary | null> {
  const project = await projectRefRepo.findByCode(code);
  if (!project || project.removedAt) return null;
  const teamIds: string[] = project.teamIds ?? [];
  const teamNames = new Map((await teamRefRepo.findByIds(teamIds)).map((team) => [team.id, team.name]));
  const { sprints, backlog } = planningRepositories();
  const teams: ProjectSprintTeamInput[] = await Promise.all(teamIds.map(async (teamId: string) => ({
    teamId,
    teamName: teamNames.get(teamId) ?? null,
    sprints: await sprints.list(teamId),
    tasks: await backlog.list(teamId),
  })));
  return summarizeProjectSprints(project.code, teams, now);
}
