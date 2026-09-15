/**
 * チームタスクの project_id が、 そのチームに属する Cc プロジェクトかを検証する (純粋関数 + lookup 注入)。
 * spec/feature/task-integration/spec.md §6.2
 *
 * 個人タスク (team_id=null) の project_id は従来どおり不透明参照 (EducationLab 連携) なので検証しない。
 */

export interface ProjectLookupRow {
  teamIds: readonly string[];
  removedAt: Date | null;
}

export async function validateTeamProject(
  teamId: string | null,
  projectId: string | null,
  findProject: (code: string) => Promise<ProjectLookupRow | undefined>,
): Promise<string | undefined> {
  if (!teamId || !projectId) return undefined;
  const project = await findProject(projectId);
  if (!project || project.removedAt) return "project_id must be a Concordia project code";
  if (!project.teamIds.includes(teamId)) return "project_id must belong to the task's team in Concordia";
  return undefined;
}
