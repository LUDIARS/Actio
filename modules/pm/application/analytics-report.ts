/**
 * 分析レポートのユースケース (PLAN §4, completion.md AT-PM-ANALYTICS)
 *
 * 総合レポートはプロジェクトの同期間隔だけキャッシュし、同期・コンフリクト解決で無効化する。
 */

import { buildBugSeries } from "../analytics/bug-series.js";
import { calculateCriticalPath, findDecompositionCandidates } from "../analytics/critical-path.js";
import { generateGompertzReport } from "../analytics/gompertz.js";
import { forecastProgress, type ProgressForecast, type TaskClosure } from "../analytics/progress-forecast.js";
import type { FullReport, GompertzReport, ProgressReport } from "../types.js";
import type { PmProjectRow, PmSnapshotRow, PmTaskRow } from "./ports.js";

export const FULL_REPORT_TYPE = "full_report";

export interface AnalyticsInput {
  projectId: string;
  tasks: PmTaskRow[];
  snapshots: PmSnapshotRow[];
  now: Date;
}

function analysisTasks(tasks: readonly PmTaskRow[]) {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    estimatedHours: t.estimatedHours,
    assignees: t.assignees ?? [],
    blockedBy: t.blockedBy ?? [],
    dueDate: t.dueDate,
  }));
}

/** close を記録したスナップショット (外部での close と、Actio からの書き戻しによる close) */
export function closuresFromSnapshots(tasks: readonly PmTaskRow[], snapshots: readonly PmSnapshotRow[]): TaskClosure[] {
  const assigneesById = new Map(tasks.map((t) => [t.id, t.assignees ?? []]));
  return snapshots
    .filter((s) => (s.changedFields as Record<string, { after?: unknown }>).status?.after === "closed")
    .map((s) => ({ taskId: s.taskId, assignees: assigneesById.get(s.taskId) ?? [], closedAt: new Date(s.detectedAt) }));
}

function createdAtOf(task: PmTaskRow): Date {
  return task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
}

export function buildProgressReport(input: AnalyticsInput, criticalPathIds: ReadonlySet<string> = new Set()): ProgressReport & { forecast: ProgressForecast } {
  const tasksByStatus: Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};
  let completed = 0;
  for (const task of input.tasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] ?? 0) + 1;
    tasksByPriority[task.priority] = (tasksByPriority[task.priority] ?? 0) + 1;
    if (task.status === "closed") completed++;
  }
  const forecast = forecastProgress(
    input.tasks.map((t) => ({ id: t.id, status: t.status, assignees: t.assignees ?? [] })),
    closuresFromSnapshots(input.tasks, input.snapshots),
    input.now,
    criticalPathIds,
  );
  return {
    projectId: input.projectId,
    totalTasks: input.tasks.length,
    completedTasks: completed,
    completionRate: input.tasks.length > 0 ? Math.round((completed / input.tasks.length) * 100) / 100 : 0,
    projectedCompletionDate: forecast.projectedCompletionDate,
    tasksByStatus,
    tasksByPriority,
    forecast,
  };
}

export function buildGompertzReport(input: AnalyticsInput): GompertzReport {
  const series = buildBugSeries(
    input.tasks.map((t) => ({ id: t.id, labels: t.labels ?? [], status: t.status, createdAt: createdAtOf(t) })),
    closuresFromSnapshots(input.tasks, input.snapshots),
  );
  return generateGompertzReport(input.projectId, series);
}

export function buildFullReport(input: AnalyticsInput): FullReport {
  const tasks = analysisTasks(input.tasks);
  const criticalPath = calculateCriticalPath(tasks);
  const criticalPathIds = new Set(criticalPath.path.map((n) => n.taskId));
  return {
    projectId: input.projectId,
    generatedAt: input.now.toISOString(),
    progress: buildProgressReport(input, criticalPathIds),
    criticalPath,
    decomposition: findDecompositionCandidates(tasks, criticalPathIds),
    gompertz: buildGompertzReport(input),
  };
}

export interface ReportCache {
  find: (projectId: string, reportType: string) => Promise<Record<string, unknown> | undefined>;
  save: (projectId: string, reportType: string, data: Record<string, unknown>, generatedAt: Date, expiresAt: Date) => Promise<void>;
}

export async function cachedFullReport(
  project: Pick<PmProjectRow, "id" | "syncIntervalMinutes">,
  load: () => Promise<AnalyticsInput>,
  cache: ReportCache,
): Promise<FullReport> {
  const cached = await cache.find(project.id, FULL_REPORT_TYPE);
  if (cached) return cached as unknown as FullReport;
  const input = await load();
  const report = buildFullReport(input);
  const expiresAt = new Date(input.now.getTime() + Math.max(1, project.syncIntervalMinutes) * 60_000);
  await cache.save(project.id, FULL_REPORT_TYPE, report as unknown as Record<string, unknown>, input.now, expiresAt);
  return report;
}
