/**
 * PM ユースケースが使う永続化の port。実装は ../infra/repo-store.ts (repository.ts 経由)。
 * テストはメモリ実装を渡す。
 */

import type {
  NewPMConflict,
  NewPMTask,
  NewPMTaskSnapshot,
  NewPMTaskValidation,
  PMConflict,
  PMProject,
  PMTask,
  PMTaskSnapshot,
} from "../../../src/db/repository.js";

export type PmProjectRow = PMProject;
export type PmTaskRow = PMTask;
export type PmConflictRow = PMConflict;
export type PmSnapshotRow = PMTaskSnapshot;

export interface PmSyncStore {
  listTasks(projectId: string): Promise<PmTaskRow[]>;
  listDirty(projectId: string): Promise<PmTaskRow[]>;
  createTask(task: NewPMTask): Promise<void>;
  updateTask(id: string, data: Partial<Omit<NewPMTask, "id">>): Promise<void>;
  /** taskId → 最新スナップショットの snapshotData (前回同期時点の外部値) */
  latestSnapshots(taskIds: string[]): Promise<Map<string, Record<string, unknown>>>;
  createSnapshot(snapshot: NewPMTaskSnapshot): Promise<void>;
  pendingConflicts(projectId: string): Promise<PmConflictRow[]>;
  createConflict(conflict: NewPMConflict): Promise<void>;
  updateConflict(id: string, data: Partial<Omit<NewPMConflict, "id">>): Promise<void>;
  updateProject(id: string, data: Partial<Pick<PmProjectRow, "lastSyncedAt" | "lastSyncResult">>): Promise<void>;
  invalidateAnalytics(projectId: string): Promise<void>;
}

export interface PmConflictStore {
  findConflict(id: string): Promise<PmConflictRow | undefined>;
  findTask(id: string): Promise<PmTaskRow | undefined>;
  /** pending のときだけ解決済みにする。既に解決済みなら false */
  markResolvedIfPending(id: string, data: Partial<Omit<NewPMConflict, "id">>): Promise<boolean>;
  /** LLM マージに失敗したコンフリクトを人間の解決待ちにする (status は pending のまま) */
  markNeedsHuman(id: string): Promise<void>;
  updateTask(id: string, data: Partial<Omit<NewPMTask, "id">>): Promise<void>;
  createSnapshot(snapshot: NewPMTaskSnapshot): Promise<void>;
  invalidateAnalytics(projectId: string): Promise<void>;
}

export interface PmValidationStore {
  createValidation(validation: NewPMTaskValidation): Promise<void>;
}
