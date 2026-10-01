/**
 * プロジェクトのソース種別 (GitHub / Notion) ごとの外部 I/O の選択。
 * 接続トークンはここで初めて平文に戻す。
 */

import { v4 as uuidv4 } from "uuid";
import { pmMilestoneRepo } from "../../../src/db/repository.js";
import type { CommitSource } from "../application/status-change-validation.js";
import type { PmProjectRow, PmTaskRow } from "../application/ports.js";
import { githubLabelsFor, githubStateFor } from "../domain/github-labels.js";
import { toTrackedTask, type TrackedTask } from "../domain/tracked-task.js";
import { openGitHubConfig, openNotionConfig } from "../secret/source-config.js";
import { fetchCommitFiles, fetchRepositoryFiles, searchIssueCommits } from "../sync/github-commits.js";
import { fetchGitHubIssues, fetchGitHubMilestones, updateGitHubIssue } from "../sync/github-sync.js";
import { fetchNotionTasks, updateNotionPage } from "../sync/notion-sync.js";
import type { ExternalMilestone, ExternalTask } from "../types.js";

async function saveMilestones(projectId: string, milestones: ExternalMilestone[]): Promise<void> {
  for (const ms of milestones) {
    const existing = await pmMilestoneRepo.findByExternalId(projectId, ms.externalId);
    const data = {
      title: ms.title,
      description: ms.description,
      dueDate: ms.dueDate,
      state: ms.state,
      externalUpdatedAt: ms.updatedAt,
    };
    if (existing) await pmMilestoneRepo.update(existing.id, data);
    else await pmMilestoneRepo.create({ id: uuidv4(), projectId, externalId: ms.externalId, ...data });
  }
}

export async function fetchExternalTasks(project: PmProjectRow): Promise<ExternalTask[]> {
  if (project.source === "github") {
    const config = openGitHubConfig(project.sourceConfig);
    const tasks = await fetchGitHubIssues(config);
    await saveMilestones(project.id, await fetchGitHubMilestones(config));
    return tasks;
  }
  if (project.source === "notion") return fetchNotionTasks(openNotionConfig(project.sourceConfig));
  throw new Error(`未対応のソースです: ${project.source}`);
}

/** dirty タスクを書き戻し、外部に送った値を返す。 */
export async function writebackTask(project: PmProjectRow, task: PmTaskRow): Promise<TrackedTask> {
  const local = toTrackedTask(task as unknown as Record<string, unknown>);
  if (project.source === "github") {
    const labels = githubLabelsFor(local.labels, local.status, local.priority);
    await updateGitHubIssue(openGitHubConfig(project.sourceConfig), task.externalId, {
      title: local.title,
      body: local.description ?? undefined,
      state: githubStateFor(local.status),
      labels,
      assignees: local.assignees,
      milestone: local.milestoneExternalId ? parseInt(local.milestoneExternalId, 10) : null,
    });
    return { ...local, labels };
  }
  if (project.source === "notion") {
    await updateNotionPage(openNotionConfig(project.sourceConfig), task.externalId, {
      title: local.title,
      status: local.status,
    });
    return local;
  }
  throw new Error(`未対応のソースです: ${project.source}`);
}

/** 関連コミットを取得できるソースなら CommitSource を返す (現状は GitHub のみ)。 */
export function commitSourceFor(project: PmProjectRow): CommitSource | null {
  if (project.source !== "github") return null;
  const config = openGitHubConfig(project.sourceConfig);
  return {
    searchIssueCommits: (issueNumber) => searchIssueCommits(config, issueNumber),
    fetchCommitFiles: (sha) => fetchCommitFiles(config, sha),
    fetchRepositoryFiles: () => fetchRepositoryFiles(config),
  };
}
