/**
 * PM プロジェクトの双方向同期ユースケース (PLAN §1.2 / §1.7, completion.md AT-PM-SYNC / AT-PM-CONFLICT)
 *
 * REST・WS・定期 tick のすべてがこの関数を呼ぶ。外部 I/O と永続化は deps で受ける。
 */

import { decideConflict } from "../domain/conflict-policy.js";
import { conflictNotification, externalChangeNotifications, taskCreatedNotification, writebackNotification, type PmNotificationIntent } from "../domain/notifications.js";
import { decideTaskSync, externalChangeType } from "../domain/sync-plan.js";
import { changedFields, toTrackedTask, type TrackedField, type TrackedTask } from "../domain/tracked-task.js";
import type { ExternalTask, SyncResult } from "../types.js";
import type { PmConflictRow, PmProjectRow, PmSyncStore, PmTaskRow } from "./ports.js";

export class SyncInProgressError extends Error {
  constructor(projectId: string) {
    super(`プロジェクト ${projectId} は同期中です`);
  }
}

export interface SyncDeps {
  store: PmSyncStore;
  /** 外部ソースからタスクを取得する (マイルストーンの保存もここで行う) */
  fetchExternal: (project: PmProjectRow) => Promise<ExternalTask[]>;
  /** dirty タスクを外部に書き戻し、実際に送った値を返す */
  writeback: (project: PmProjectRow, task: PmTaskRow) => Promise<TrackedTask>;
  enqueue: (intents: readonly PmNotificationIntent[]) => Promise<void>;
  /** ステータスが review になったタスク (関連コミット検証の契機) */
  onReviewTransition: (project: PmProjectRow, taskIds: string[]) => void;
  now: () => Date;
  newId: () => string;
  hashDescription: (description: string | null) => string;
}

/** 同じプロジェクトの同期を同時に 1 本に制限する (プロセス内)。 */
export class SyncLock {
  private readonly running = new Set<string>();

  isRunning(projectId: string): boolean {
    return this.running.has(projectId);
  }

  acquire(projectId: string): () => void {
    if (this.running.has(projectId)) throw new SyncInProgressError(projectId);
    this.running.add(projectId);
    return () => {
      this.running.delete(projectId);
    };
  }
}

export const defaultSyncLock = new SyncLock();

export type StoredSyncResult = SyncResult & { attemptedAt: string; finishedAt: string };

function emptyResult(): SyncResult {
  return { created: 0, updated: 0, closed: 0, unchanged: 0, conflicts: 0, errors: [] };
}

function changeMap(base: TrackedTask, next: TrackedTask, fields: readonly TrackedField[]): Record<string, { before: unknown; after: unknown }> {
  return Object.fromEntries(fields.map((f) => [f, { before: base[f], after: next[f] }]));
}

function trackedColumns(task: TrackedTask, hash: (d: string | null) => string): Partial<PmTaskRow> {
  return { ...task, descriptionHash: hash(task.description) };
}

class ProjectSync {
  private readonly result = emptyResult();
  private readonly intents: PmNotificationIntent[] = [];
  private readonly reviewTransitions: string[] = [];

  constructor(private readonly project: PmProjectRow, private readonly deps: SyncDeps) {}

  async run(): Promise<StoredSyncResult> {
    const attemptedAt = this.deps.now().toISOString();
    let pulled = false;
    try {
      const external = await this.deps.fetchExternal(this.project);
      await this.pull(external);
      pulled = true;
      await this.pushDirty();
    } catch (error) {
      this.result.errors.push(error instanceof Error ? error.message : String(error));
    }
    const finishedAt = this.deps.now().toISOString();
    const stored: StoredSyncResult = { ...this.result, attemptedAt, finishedAt };
    await this.deps.store.updateProject(this.project.id, {
      ...(pulled ? { lastSyncedAt: finishedAt } : {}),
      lastSyncResult: stored,
    });
    if (pulled) await this.deps.store.invalidateAnalytics(this.project.id);
    if (this.intents.length > 0) await this.deps.enqueue(this.intents);
    if (this.reviewTransitions.length > 0) this.deps.onReviewTransition(this.project, this.reviewTransitions);
    return stored;
  }

  private ref(task: Pick<PmTaskRow, "id" | "title">) {
    return { id: task.id, projectId: this.project.id, title: task.title };
  }

  private async snapshot(taskId: string, changeType: string, changes: Record<string, { before: unknown; after: unknown }>, data: TrackedTask): Promise<void> {
    await this.deps.store.createSnapshot({
      id: this.deps.newId(),
      taskId,
      changeType,
      changedFields: changes,
      snapshotData: data,
      detectedAt: this.deps.now().toISOString(),
    });
  }

  private async pull(externalTasks: ExternalTask[]): Promise<void> {
    const stored = await this.deps.store.listTasks(this.project.id);
    const storedByExternalId = new Map(stored.map((t) => [t.externalId, t]));
    const bases = await this.deps.store.latestSnapshots(stored.map((t) => t.id));
    const pending = new Map((await this.deps.store.pendingConflicts(this.project.id)).map((c) => [c.taskId, c]));

    for (const ext of externalTasks) {
      const row = storedByExternalId.get(ext.externalId);
      const external = toTrackedTask(ext as unknown as Record<string, unknown>);
      if (!row) {
        await this.create(ext, external);
        continue;
      }
      const base = toTrackedTask(bases.get(row.id) ?? (row as unknown as Record<string, unknown>));
      const local = toTrackedTask(row as unknown as Record<string, unknown>);
      const decision = decideTaskSync({
        base,
        stored: local,
        external,
        localDirty: row.dirtyFlag === 1,
        hasPendingConflict: pending.has(row.id),
      });
      switch (decision.kind) {
        case "unchanged":
        case "keep_local":
          this.result.unchanged++;
          break;
        case "await_resolution":
          await this.refreshPendingConflict(pending.get(row.id) as PmConflictRow, external);
          this.result.conflicts++;
          break;
        case "apply_external":
          await this.applyExternal(row, ext, base, external, decision.externalChanges);
          break;
        case "conflict":
          await this.resolveOnPull(row, ext, base, local, external);
          break;
      }
    }
  }

  private async create(ext: ExternalTask, external: TrackedTask): Promise<void> {
    const id = this.deps.newId();
    const now = this.deps.now().toISOString();
    await this.deps.store.createTask({
      id,
      projectId: this.project.id,
      externalId: ext.externalId,
      externalUrl: ext.externalUrl,
      ...trackedColumns(external, this.deps.hashDescription),
      title: external.title,
      externalUpdatedAt: ext.updatedAt,
      lastSyncedAt: now,
    });
    await this.snapshot(id, "created", {}, external);
    this.intents.push(taskCreatedNotification(this.ref({ id, title: external.title }), ext.updatedAt));
    this.result.created++;
  }

  private async applyExternal(row: PmTaskRow, ext: ExternalTask, base: TrackedTask, external: TrackedTask, fields: TrackedField[]): Promise<void> {
    await this.deps.store.updateTask(row.id, {
      ...trackedColumns(external, this.deps.hashDescription),
      externalUpdatedAt: ext.updatedAt,
      lastSyncedAt: this.deps.now().toISOString(),
    });
    const changeType = externalChangeType(base, external);
    await this.snapshot(row.id, changeType, changeMap(base, external, fields), external);
    this.intents.push(...externalChangeNotifications(this.ref({ id: row.id, title: external.title }), base, external, changeType, fields, ext.updatedAt));
    if (external.status === "review" && base.status !== "review") this.reviewTransitions.push(row.id);
    if (changeType === "closed") this.result.closed++;
    else this.result.updated++;
  }

  private async resolveOnPull(row: PmTaskRow, ext: ExternalTask, base: TrackedTask, local: TrackedTask, external: TrackedTask): Promise<void> {
    const versions = { base, local, external };
    const decision = decideConflict(versions);
    const now = this.deps.now().toISOString();
    const ref = this.ref({ id: row.id, title: external.title });
    const externalFields = changedFields(base, external);

    if (decision.stage === "claude_merge") {
      await this.deps.store.createConflict({
        id: this.deps.newId(),
        taskId: row.id,
        projectId: this.project.id,
        localVersion: local,
        externalVersion: external,
        baseVersion: base,
        resolution: "claude_merge",
        resolvedData: null,
        status: "pending",
        createdAt: now,
      });
      this.intents.push(conflictNotification("conflict", ref, `重なった変更: ${decision.overlappingFields.join(", ")}`, ext.updatedAt));
      this.result.conflicts++;
      return;
    }

    const merged = decision.merged;
    const stillDirty = decision.stage === "auto_field_merge" && changedFields(external, merged).length > 0;
    await this.deps.store.updateTask(row.id, {
      ...trackedColumns(merged, this.deps.hashDescription),
      externalUpdatedAt: ext.updatedAt,
      lastSyncedAt: now,
      dirtyFlag: stillDirty ? 1 : 0,
    });
    // base は外部の値。Actio 側に残した変更は dirty のまま書き戻しで外部へ送る
    await this.snapshot(row.id, externalChangeType(base, external), changeMap(base, external, externalFields), external);
    if (decision.stage === "force_external") {
      // Actio 側の値はコンフリクト記録に残す (PLAN §1.7 Stage 3)
      await this.deps.store.createConflict({
        id: this.deps.newId(),
        taskId: row.id,
        projectId: this.project.id,
        localVersion: local,
        externalVersion: external,
        baseVersion: base,
        resolution: "force_external",
        resolvedData: merged,
        status: "resolved",
        createdAt: now,
        resolvedAt: now,
      });
      const reason = decision.reason === "diff_ratio" ? "外部の変更が大きいため" : "open/closed が食い違ったため";
      this.intents.push(conflictNotification("force_external", ref, `${reason}外部の値を採用しました`, ext.updatedAt));
    } else {
      this.intents.push(conflictNotification("auto_merged", ref, "両側の変更をフィールド単位でマージしました", ext.updatedAt));
    }
    if (merged.status === "review" && base.status !== "review") this.reviewTransitions.push(row.id);
    this.result.updated++;
  }

  private async refreshPendingConflict(conflict: PmConflictRow, external: TrackedTask): Promise<void> {
    const recorded = toTrackedTask(conflict.externalVersion);
    if (changedFields(recorded, external).length === 0) return;
    await this.deps.store.updateConflict(conflict.id, { externalVersion: external });
  }

  private async pushDirty(): Promise<void> {
    const pendingTaskIds = new Set((await this.deps.store.pendingConflicts(this.project.id)).map((c) => c.taskId));
    const dirty = (await this.deps.store.listDirty(this.project.id)).filter((t) => !pendingTaskIds.has(t.id));
    if (dirty.length === 0) return;
    const bases = await this.deps.store.latestSnapshots(dirty.map((t) => t.id));
    for (const task of dirty) {
      const version = this.deps.now().toISOString();
      try {
        const sent = await this.deps.writeback(this.project, task);
        const base = toTrackedTask(bases.get(task.id) ?? (task as unknown as Record<string, unknown>));
        await this.deps.store.updateTask(task.id, {
          labels: sent.labels,
          dirtyFlag: 0,
          externalUpdatedAt: version,
          lastSyncedAt: version,
        });
        // 次の Pull で自分の書き戻しを外部変更と見なさないよう、送った値を base にする
        await this.snapshot(task.id, "writeback", changeMap(base, sent, changedFields(base, sent)), sent);
        this.intents.push(writebackNotification(true, this.ref(task), "Actio の変更を外部に反映しました", version));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.result.errors.push(`Writeback failed for ${task.id}: ${message}`);
        this.intents.push(writebackNotification(false, this.ref(task), message, version));
      }
    }
  }
}

export async function syncProject(project: PmProjectRow, deps: SyncDeps, lock: SyncLock = defaultSyncLock): Promise<StoredSyncResult> {
  const release = lock.acquire(project.id);
  try {
    return await new ProjectSync(project, deps).run();
  } finally {
    release();
  }
}
