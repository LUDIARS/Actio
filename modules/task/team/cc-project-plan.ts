import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:0bd50c32 */
import augurContract_9bb7a50f from '../../../contracts/cc-project-rename-plan.contract.ts'; /* augur-inject:contract-predicate:b55fdf94 */
import augurContract_2e859e36 from '../../../contracts/cc-project-team-plan.contract.ts'; /* augur-inject:contract-predicate:fa17d7cf */
/**
 * Cc プロジェクト同期でタスクへ波及させる変更を決める (純粋関数)。
 * spec/feature/task-integration/spec.md §6.5
 *
 * - 改名: `renamed_from` の旧 code を指すタスクを新 code へ付け替える。
 * - チーム割り当て: team_ids が変わってチームが 1 つになったプロジェクトの、 teamId 空タスクにそのチームを付ける。
 */

export interface ProjectRename {
  from: string;
  to: string;
}

export interface ProjectTeamBinding {
  code: string;
  teamId: string;
}

/**
 * 旧 code が Cc にまだ登録されている (別プロジェクトとして生きている) ときは付け替えない。
 * code は大文字小文字を区別して突き合わせる (`LD`/`Ld` のような組を混同しない)。
 */
export function planProjectRenames(projects: { code: string; renamedFrom: string[] }[]): ProjectRename[] {
  const live = new Set(projects.map((project) => project.code));
  const seen = new Set<string>();
  const renames: ProjectRename[] = [];
  for (const project of projects) {
    for (const from of project.renamedFrom) {
      if (live.has(from) || seen.has(from)) continue;
      seen.add(from);
      renames.push({ from, to: project.code });
    }
  }
  return renames;
}
// @ts-expect-error augur-inject
planProjectRenames = contract(planProjectRenames, { ...augurContract_9bb7a50f, contractId: 'C-6', mode: 'observe', sample: 1, where: 'modules/task/team/cc-project-plan.ts:23', rule: 'contract-wrap', id: '9bb7a50f' }); /* augur-inject:contract-wrap:9bb7a50f */

function sameTeams(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((teamId) => set.has(teamId));
}

/**
 * `previous` は同期前の project_refs の team_ids (code → team_ids)。 未登録の code は「チーム無し」から変わったとみなす。
 * チームが複数のプロジェクトはどのチームか決められないので触らない。 チームが外れた場合も既存タスクは触らない。
 */
export function planTeamBindings(
  projects: { code: string; teamIds: string[] }[],
  previous: Map<string, string[]>,
): ProjectTeamBinding[] {
  return projects
    .filter((project) => project.teamIds.length === 1)
    .filter((project) => !sameTeams(previous.get(project.code) ?? [], project.teamIds))
    .map((project) => ({ code: project.code, teamId: project.teamIds[0] }));
}
// @ts-expect-error augur-inject
planTeamBindings = contract(planTeamBindings, { ...augurContract_2e859e36, contractId: 'C-7', mode: 'observe', sample: 1, where: 'modules/task/team/cc-project-plan.ts:47', rule: 'contract-wrap', id: '2e859e36' }); /* augur-inject:contract-wrap:2e859e36 */
