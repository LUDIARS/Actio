/**
 * PM ユースケースの port を repository.ts で実装する。
 */

import {
  pmAnalyticsCacheRepo,
  pmConflictRepo,
  pmProjectRepo,
  pmTaskRepo,
  pmTaskSnapshotRepo,
  pmTaskValidationRepo,
} from "../../../src/db/repository.js";
import { v4 as uuidv4 } from "uuid";
import type { ReportCache } from "../application/analytics-report.js";
import type { PmConflictStore, PmSyncStore, PmValidationStore } from "../application/ports.js";

async function latestSnapshots(taskIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const latest = await pmTaskSnapshotRepo.findLatestForTasks(taskIds);
  return new Map([...latest.entries()].map(([taskId, row]) => [taskId, row.snapshotData]));
}

export const pmSyncStore: PmSyncStore = {
  listTasks: (projectId) => pmTaskRepo.findByProject(projectId),
  listDirty: (projectId) => pmTaskRepo.findDirty(projectId),
  createTask: (task) => pmTaskRepo.create(task),
  updateTask: (id, data) => pmTaskRepo.update(id, data),
  latestSnapshots,
  createSnapshot: (snapshot) => pmTaskSnapshotRepo.create(snapshot),
  pendingConflicts: (projectId) => pmConflictRepo.findByProject(projectId, "pending"),
  createConflict: (conflict) => pmConflictRepo.create(conflict),
  updateConflict: (id, data) => pmConflictRepo.update(id, data),
  updateProject: (id, data) => pmProjectRepo.update(id, data),
  invalidateAnalytics: (projectId) => pmAnalyticsCacheRepo.deleteByProject(projectId),
};

export const pmConflictStore: PmConflictStore = {
  findConflict: (id) => pmConflictRepo.findById(id),
  findTask: (id) => pmTaskRepo.findById(id),
  markResolvedIfPending: (id, data) => pmConflictRepo.updateIfPending(id, data),
  markNeedsHuman: async (id) => {
    await pmConflictRepo.updateIfPending(id, { resolution: "manual" });
  },
  updateTask: (id, data) => pmTaskRepo.update(id, data),
  createSnapshot: (snapshot) => pmTaskSnapshotRepo.create(snapshot),
  invalidateAnalytics: (projectId) => pmAnalyticsCacheRepo.deleteByProject(projectId),
};

export const pmValidationStore: PmValidationStore = {
  createValidation: (validation) => pmTaskValidationRepo.create(validation),
};

export const pmReportCache: ReportCache = {
  async find(projectId, reportType) {
    return (await pmAnalyticsCacheRepo.findLatest(projectId, reportType))?.data;
  },
  async save(projectId, reportType, data, generatedAt, expiresAt) {
    await pmAnalyticsCacheRepo.create({
      id: uuidv4(),
      projectId,
      reportType,
      data,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  },
};
