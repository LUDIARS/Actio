import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:0a0437eb */
import augurContract_5e4e7b87 from '../../../contracts/cc-project-parse.contract.ts'; /* augur-inject:contract-predicate:93b9f3d1 */
/**
 * Cc `GET /v1/project-codes/admin` の応答から、 Actio が持つ項目 (code / name / team_ids) と改名元だけを取り出す。
 * spec/feature/task-integration/spec.md §6.1
 *
 * 応答には repo_origin / repo_path も含まれるが、 Actio には保存しない (team-task §2.1 の方針)。
 */

export interface CcProject {
  code: string;
  name: string;
  teamIds: string[];
  /** Cc の `renamed_from` (旧 code)。 Cc が出さないときは空 (task-integration §6.5)。 */
  renamedFrom: string[];
}

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `renamed_from` は Cc 側で後から足される任意項目。 文字列か文字列配列だけを読み、
 * 形が違えば無視する (改名の付け替えを諦めるだけで、 本体の同期は止めない)。
 */
function parseRenamedFrom(value: unknown, code: string): string[] {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const codes = list.filter((old): old is string => typeof old === "string" && CODE_PATTERN.test(old) && old !== code);
  return [...new Set(codes)];
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
    projects.push({
      code: entry.code,
      name: entry.project,
      teamIds: [...new Set(teamIds)],
      renamedFrom: parseRenamedFrom(entry.renamed_from, entry.code),
    });
  }
  return projects;
}
// @ts-expect-error augur-inject
parseCcProjects = contract(parseCcProjects, { ...augurContract_5e4e7b87, contractId: 'C-5', mode: 'observe', sample: 1, where: 'modules/task/team/cc-project-parse.ts:33', rule: 'contract-wrap', id: '5e4e7b87' }); /* augur-inject:contract-wrap:5e4e7b87 */
