/**
 * Cc `GET /v1/project-codes/admin` の応答から、 Actio が持つ項目 (code / name / team_ids) だけを取り出す。
 * spec/feature/task-integration/spec.md §6.1
 *
 * 応答には repo_origin / repo_path も含まれるが、 Actio には保存しない (team-task §2.1 の方針)。
 */

export interface CcProject {
  code: string;
  name: string;
  teamIds: string[];
}

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 形が崩れていれば null (部分的に同期して整合を壊さない)。 */
export function parseCcProjects(payload: unknown): CcProject[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) return null;
  const projects: CcProject[] = [];
  for (const entry of payload.entries) {
    if (!isRecord(entry)) return null;
    if (typeof entry.code !== "string" || !CODE_PATTERN.test(entry.code)) return null;
    if (typeof entry.project !== "string" || entry.project.length === 0) return null;
    const teams = entry.teams === undefined ? [] : entry.teams;
    if (!Array.isArray(teams)) return null;
    const teamIds: string[] = [];
    for (const team of teams) {
      if (!isRecord(team) || typeof team.id !== "string" || team.id.length === 0) return null;
      teamIds.push(team.id);
    }
    projects.push({ code: entry.code, name: entry.project, teamIds: [...new Set(teamIds)] });
  }
  return projects;
}
