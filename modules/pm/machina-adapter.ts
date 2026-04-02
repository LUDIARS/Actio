/**
 * M3 MACHINA → M2 PM リレーアダプタ
 *
 * MACHINA で自動生成されたタスクを PM モジュールの pm_tasks に登録する。
 * グループごとに「MACHINA Auto-Generated」プロジェクトを自動作成し、
 * そこにタスクをリレーする。
 */

import { randomUUID } from "crypto";
import { pmProjectRepo, pmTaskRepo } from "../../src/db/repository.js";
import type { MachinaTask } from "../../src/shared/types.js";
import type { MachinaPmRelay } from "../../src/shared/types.js";
import { registerPmRelayAdapter } from "../machina/pm-relay.js";

/** MACHINA ステータス → PM ステータスのマッピング */
const STATUS_MAP: Record<string, string> = {
  pending: "open",
  in_progress: "in_progress",
  done: "closed",
  cancelled: "closed",
};

/**
 * グループ用の MACHINA プロジェクトを取得または作成する
 */
async function getOrCreateMachinaProject(
  groupId: string,
  createdBy: string
): Promise<string> {
  // 既存の MACHINA プロジェクトを検索
  const allProjects = await pmProjectRepo.findAll();
  const existing = allProjects.find(
    (p: { source: string; sourceConfig: Record<string, string> }) =>
      p.source === "machina" && p.sourceConfig.groupId === groupId
  );
  if (existing) return existing.id;

  // なければ作成
  const projectId = randomUUID();
  await pmProjectRepo.create({
    id: projectId,
    name: `MACHINA (${groupId.slice(0, 8)})`,
    source: "machina",
    sourceConfig: { groupId },
    syncIntervalMinutes: 0,
    lastSyncedAt: null,
    ownerId: createdBy,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(
    `[pm:machina-adapter] MACHINA プロジェクト作成: ${projectId} (group: ${groupId})`
  );

  return projectId;
}

/**
 * PM リレーアダプタの実装
 */
const machinaAdapter: MachinaPmRelay = {
  async createTask(task: MachinaTask): Promise<{ pmTaskId: string }> {
    const projectId = await getOrCreateMachinaProject(
      task.groupId,
      task.createdBy
    );

    const pmTaskId = randomUUID();
    const now = new Date().toISOString();

    await pmTaskRepo.create({
      id: pmTaskId,
      projectId,
      externalId: task.id,
      externalUrl: null,
      title: task.title,
      description: task.description,
      status: STATUS_MAP[task.status] ?? "open",
      priority: task.priority,
      assignees: task.assigneeId ? [task.assigneeId] : [],
      labels: ["machina", `source:${task.source}`],
      dueDate: task.dueDate,
      milestoneExternalId: null,
      milestoneName: null,
      estimatedHours: null,
      blockedBy: [],
      descriptionHash: null,
      dirtyFlag: 0,
      localUpdatedAt: now,
      externalUpdatedAt: now,
      lastSyncedAt: now,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(
      `[pm:machina-adapter] タスクリレー: "${task.title}" → PM (${pmTaskId})`
    );

    return { pmTaskId };
  },

  async updateTask(
    pmTaskId: string,
    updates: Partial<MachinaTask>
  ): Promise<void> {
    const pmUpdates: Record<string, unknown> = {};

    if (updates.title !== undefined) pmUpdates.title = updates.title;
    if (updates.description !== undefined)
      pmUpdates.description = updates.description;
    if (updates.status !== undefined)
      pmUpdates.status = STATUS_MAP[updates.status] ?? updates.status;
    if (updates.priority !== undefined) pmUpdates.priority = updates.priority;
    if (updates.dueDate !== undefined) pmUpdates.dueDate = updates.dueDate;
    if (updates.assigneeId !== undefined)
      pmUpdates.assignees = updates.assigneeId
        ? [updates.assigneeId]
        : [];

    pmUpdates.externalUpdatedAt = new Date().toISOString();

    await pmTaskRepo.update(pmTaskId, pmUpdates);

    console.log(`[pm:machina-adapter] PM タスク更新: ${pmTaskId}`);
  },
};

/**
 * MACHINA → PM リレーを初期化する
 * app.ts から呼び出す
 */
export function initMachinaRelay(): void {
  registerPmRelayAdapter(machinaAdapter);
  console.log("[pm:machina-adapter] MACHINA → PM リレーアダプタを登録しました");
}
