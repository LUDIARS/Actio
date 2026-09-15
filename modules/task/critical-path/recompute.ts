/**
 * チーム単位でクリティカルパスを計算し、 タスク行へ保存する (task-integration §5.2)。
 * 同じチームの再計算は直列化し、 後から来た変更が先の結果に上書きされないようにする。
 */

import { taskRepo, teamRefRepo, type Task } from "../../../src/db/repository.js";
import { defaultTeamSettings, TeamSettingsSchema } from "../team/settings.js";
import { computeCriticalPath, isCriticalPathTarget, type CriticalPathResult } from "./compute.js";

/** 再計算を起こすタスク列。 これ以外の変更では依存グラフも所要日数も変わらない。 */
export const CRITICAL_PATH_FIELDS = ["blockedBy", "durationDays", "estimatedMinutes", "status", "lane", "teamId"] as const;

const chains = new Map<string, Promise<void>>();

async function dailyMinutesFor(teamId: string): Promise<number> {
  const team = await teamRefRepo.findById(teamId);
  return team ? TeamSettingsSchema.parse(team.settings).default_daily_minutes : defaultTeamSettings().default_daily_minutes;
}

export async function computeTeamCriticalPath(teamId: string): Promise<{ tasks: Task[]; result: CriticalPathResult }> {
  const tasks = await taskRepo.list({ teamId });
  const result = computeCriticalPath(tasks.map((task) => ({
    id: task.id,
    status: task.status,
    lane: task.lane,
    blockedBy: task.blockedBy ?? [],
    durationDays: task.durationDays,
    estimatedMinutes: task.estimatedMinutes,
  })), await dailyMinutesFor(teamId));
  return { tasks, result };
}

async function persist(teamId: string): Promise<void> {
  const { tasks, result } = await computeTeamCriticalPath(teamId);
  const computed = new Map(result.tasks.map((task) => [task.id, task]));
  const cyclic = new Set(result.cycles.flat());
  const now = new Date();
  for (const task of tasks) {
    const row = computed.get(task.id);
    const next = row
      ? { isCriticalPath: row.isCriticalPath, slackDays: row.slackDays, criticalPathError: null, criticalPathComputedAt: now }
      : cyclic.has(task.id)
        ? { isCriticalPath: false, slackDays: null, criticalPathError: "cycle", criticalPathComputedAt: now }
        : { isCriticalPath: false, slackDays: null, criticalPathError: null, criticalPathComputedAt: isCriticalPathTarget(task) ? now : null };
    const unchanged = Boolean(task.isCriticalPath) === next.isCriticalPath
      && (task.slackDays ?? null) === next.slackDays
      && (task.criticalPathError ?? null) === next.criticalPathError;
    if (!unchanged) await taskRepo.updateCriticalPathFields(task.id, next);
  }
}

/** 直列化した再計算。 失敗は投げる (呼び出し側が方針を決める)。 */
export function recomputeTeamCriticalPath(teamId: string): Promise<void> {
  const previous = chains.get(teamId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => persist(teamId));
  chains.set(teamId, current);
  void current.finally(() => {
    if (chains.get(teamId) === current) chains.delete(teamId);
  }).catch(() => undefined);
  return current;
}

/**
 * タスク API から呼ぶ入口。 表示用の派生値なので、 失敗してもタスクの変更自体は成立させ、
 * 警告を残す (次の変更で再計算される)。
 */
export async function recomputeCriticalPathSafely(teamIds: readonly (string | null | undefined)[]): Promise<void> {
  for (const teamId of new Set(teamIds.filter((id): id is string => typeof id === "string" && id.length > 0))) {
    try {
      await recomputeTeamCriticalPath(teamId);
    } catch (error) {
      console.warn(`[critical-path] チーム ${teamId} の再計算に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
