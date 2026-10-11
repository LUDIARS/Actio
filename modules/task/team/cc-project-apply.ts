/**
 * Cc から読んだプロジェクト一覧を project_refs とタスクへ反映する (task-integration §6.1 / §6.5)。
 *
 * 順序: 改名の付け替え → チーム割り当ての反映 → project_refs の upsert → 消えた code の removed_at。
 * project_refs の更新を最後にするので、 途中で失敗しても次の tick で同じ差分をもう一度検出してやり直せる。
 */

import { projectRefRepo, taskRepo } from "../../../src/db/repository.js";
import type { CcProject } from "./cc-project-parse.js";
import { planProjectRenames, planTeamBindings } from "./cc-project-plan.js";

export interface ProjectApplyCounts {
  /** 新 code へ付け替えたタスク数 */
  renamedTasks: number;
  /** チームを付けたタスク数 */
  teamBoundTasks: number;
}

export async function applyCcProjects(projects: CcProject[], now: Date): Promise<ProjectApplyCounts> {
  const previous = new Map((await projectRefRepo.listAll()).map((row) => [row.code, row.teamIds ?? []]));
  let renamedTasks = 0;
  for (const rename of planProjectRenames(projects)) {
    renamedTasks += await taskRepo.reassignProject(rename.from, rename.to);
  }
  let teamBoundTasks = 0;
  for (const binding of planTeamBindings(projects, previous)) {
    teamBoundTasks += await taskRepo.bindTeamToProjectTasks(binding.code, binding.teamId);
  }
  for (const project of projects) {
    await projectRefRepo.upsertFromCc({ code: project.code, name: project.name, teamIds: project.teamIds, syncedAt: now });
  }
  await projectRefRepo.markRemovedExcept(projects.map((project) => project.code), now);
  return { renamedTasks, teamBoundTasks };
}
