/**
 * 既存タスクのプロジェクト整合を一度だけ直す移行の計画 (純粋関数)。
 * spec/feature/task-integration/spec.md §6.6 / Concordia spec/faq/actio-cc-task-project-sync.md §5 (M2 / M3)
 *
 * 同期 tick は「変わったとき」しか波及させないため、 それ以前から残るずれはこの計画で一覧にする。
 */

import type { ProjectRename } from "./cc-project-plan.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:facc6fa5 */
import augurContract_caaf5b69 from '../../../contracts/cc-project-backfill-plan.contract.ts'; /* augur-inject:contract-predicate:f8593eb5 */

export interface BackfillTask {
  id: string;
  projectId: string | null;
  teamId: string | null;
  sprintId: string | null;
}

export interface BackfillProject {
  code: string;
  teamIds: string[];
}

export interface ProjectBackfillPlan {
  /** M2: 旧 code を指すタスクの付け替え */
  renames: { taskId: string; from: string; to: string }[];
  /** M3: チームが 1 つのプロジェクトに属する teamId 空タスクへのチーム付与 */
  teamBindings: { taskId: string; projectId: string; teamId: string }[];
  /** M3: チームが複数で自動では決められないもの (人が選ぶ) */
  multiTeam: { taskId: string; projectId: string; teamIds: string[] }[];
}

export function planProjectBackfill(
  tasks: BackfillTask[],
  projects: BackfillProject[],
  renames: ProjectRename[],
): ProjectBackfillPlan {
  const renameTo = new Map(renames.map((rename) => [rename.from, rename.to]));
  const teamsByCode = new Map(projects.map((project) => [project.code, project.teamIds]));
  const plan: ProjectBackfillPlan = { renames: [], teamBindings: [], multiTeam: [] };
  for (const task of tasks) {
    if (task.projectId === null) continue;
    const renamed = renameTo.get(task.projectId);
    if (renamed !== undefined) plan.renames.push({ taskId: task.id, from: task.projectId, to: renamed });
    const projectId = renamed ?? task.projectId;
    // スプリントはチーム単位なので、 スプリントに入っているタスクのチームは変えない。
    if (task.teamId !== null || task.sprintId !== null) continue;
    const teamIds = teamsByCode.get(projectId) ?? [];
    if (teamIds.length === 1) plan.teamBindings.push({ taskId: task.id, projectId, teamId: teamIds[0] });
    else if (teamIds.length > 1) plan.multiTeam.push({ taskId: task.id, projectId, teamIds: [...teamIds] });
  }
  return plan;
}
// @ts-expect-error augur-inject
planProjectBackfill = contract(planProjectBackfill, { ...augurContract_caaf5b69, contractId: 'C-8', mode: 'observe', sample: 1, where: 'modules/task/team/cc-project-backfill-plan.ts:31', rule: 'contract-wrap', id: 'caaf5b69' }); /* augur-inject:contract-wrap:caaf5b69 */
