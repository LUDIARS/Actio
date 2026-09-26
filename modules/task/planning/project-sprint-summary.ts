/**
 * Cc プロジェクト別のスプリント集計 (純粋関数)。 Breviarium が読む。
 * spec/feature/task-integration/spec.md §6.4
 *
 * タスクの本文・タイトル・担当者・id は出さない。 出すのは件数と、 スプリントの名前 / ゴール / 日付だけ。
 * 入力の tasks はチームのバックログレーン (`BacklogStore.list`) なので lane は常に backlog。
 */

import type { BacklogTask, Sprint } from "./contracts.js";
import { sprintImpact } from "./impact.js";
import { findCurrentSprint, isClosedStatus } from "../views/current-sprint-view.js";

export interface ProjectSprintTeamInput {
  teamId: string;
  /** team_refs に行が無い (未同期の) チームは null。 */
  teamName: string | null;
  sprints: readonly Sprint[];
  tasks: readonly BacklogTask[];
}

export interface StatusCounts {
  total: number;
  /** キーは Actio のタスク status 値そのまま。 0 件の status は載せない。 */
  byStatus: Record<string, number>;
}

export interface ActiveSprintTaskSummary extends StatusCounts {
  project: StatusCounts;
  /** 未完了かつクリティカルパス上のタスク数。 */
  criticalPath: number;
  byExecutor: { human: number; ai: number };
  /** 未完了かつ deadline が now より前のタスク数。 */
  overdue: number;
  /** 見積の合計 (cancelled を除く)。 見積の無いタスクは 0 として数える。 */
  estimatedMinutes: number;
  /** done タスクの見積の合計。 */
  doneMinutes: number;
}

export interface ActiveSprintSummary {
  id: string;
  name: string;
  goal: string | null;
  status: Sprint["status"];
  startsOn: string;
  endsOn: string;
  originalEndsOn: string;
  bufferEndsOn: string;
  cadenceDays: number;
  capacityMinutes: number | null;
  revision: number;
  tasks: ActiveSprintTaskSummary;
}

export interface PlanningSprintSummary {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface TeamSprintSummary {
  teamId: string;
  teamName: string | null;
  activeSprint: ActiveSprintSummary | null;
  planningSprints: PlanningSprintSummary[];
  backlogUnassigned: { total: number; project: number };
}

export interface ProjectSprintSummary {
  project: string;
  generatedAt: string;
  teams: TeamSprintSummary[];
}

function countByStatus(tasks: readonly BacklogTask[]): StatusCounts {
  const byStatus: Record<string, number> = {};
  for (const task of tasks) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
  return { total: tasks.length, byStatus };
}

/** SQLite は is_critical_path を 0/1、 Postgres は boolean で返す。 */
function isOnCriticalPath(task: BacklogTask): boolean {
  return task.isCriticalPath === true || task.isCriticalPath === 1;
}

/** deadline は両方言とも unix 秒 (PlanningPostgres が Date を秒へ変換する)。 */
function isOverdue(task: BacklogTask, now: Date): boolean {
  return !isClosedStatus(task.status) && task.deadline !== null && task.deadline * 1000 < now.getTime();
}

function compareSprintOrder(a: Sprint, b: Sprint): number {
  if (a.startsOn !== b.startsOn) return a.startsOn < b.startsOn ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function summarizeActiveSprint(sprint: Sprint, tasks: readonly BacklogTask[], project: string, now: Date): ActiveSprintSummary {
  const inSprint = tasks.filter((task) => task.sprintId === sprint.id);
  const pending = inSprint.filter((task) => !isClosedStatus(task.status));
  const doneMinutes = inSprint
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
  const ai = inSprint.filter((task) => task.executorType === "ai").length;
  return {
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    startsOn: sprint.startsOn,
    endsOn: sprint.endsOn,
    originalEndsOn: sprint.originalEndsOn,
    bufferEndsOn: sprint.bufferEndsOn,
    cadenceDays: sprint.cadenceDays,
    capacityMinutes: sprint.capacityMinutes,
    revision: sprint.revision,
    tasks: {
      ...countByStatus(inSprint),
      project: countByStatus(inSprint.filter((task) => task.projectId === project)),
      criticalPath: pending.filter(isOnCriticalPath).length,
      byExecutor: { human: inSprint.length - ai, ai },
      overdue: inSprint.filter((task) => isOverdue(task, now)).length,
      // sprintImpact の見積は未完了分だけなので、 done 分を足して cancelled 以外の合計にする。
      estimatedMinutes: sprintImpact(sprint, [...tasks]).estimatedMinutes + doneMinutes,
      doneMinutes,
    },
  };
}

function summarizeTeam(team: ProjectSprintTeamInput, project: string, now: Date): TeamSprintSummary {
  const active = findCurrentSprint(team.sprints);
  const unassigned = team.tasks.filter((task) => task.sprintId === null && !isClosedStatus(task.status));
  return {
    teamId: team.teamId,
    teamName: team.teamName,
    activeSprint: active ? summarizeActiveSprint(active, team.tasks, project, now) : null,
    planningSprints: team.sprints
      .filter((sprint) => sprint.status === "planning")
      .sort(compareSprintOrder)
      .map((sprint) => ({ id: sprint.id, name: sprint.name, startsOn: sprint.startsOn, endsOn: sprint.endsOn })),
    backlogUnassigned: {
      total: unassigned.length,
      project: unassigned.filter((task) => task.projectId === project).length,
    },
  };
}

export function summarizeProjectSprints(project: string, teams: readonly ProjectSprintTeamInput[], now: Date): ProjectSprintSummary {
  return {
    project,
    generatedAt: now.toISOString(),
    teams: teams.map((team) => summarizeTeam(team, project, now)),
  };
}
