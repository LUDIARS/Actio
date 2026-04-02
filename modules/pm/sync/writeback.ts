/**
 * Schedula → 外部ソースへの書き戻し
 */

import { updateGitHubIssue } from "./github-sync.js";
import { updateNotionPage } from "./notion-sync.js";
import type { GitHubSourceConfig, NotionSourceConfig, WritebackResult } from "../types.js";

interface PMProject {
  id: string;
  source: string;
  sourceConfig: Record<string, string>;
}

interface PMTask {
  id: string;
  externalId: string;
  title: string;
  description: string | null;
  status: string;
  labels: string[];
  assignees: string[];
  milestoneExternalId: string | null;
}

/**
 * Dirty タスクを外部ソースに書き戻す
 */
export async function pushDirtyTasks(
  project: PMProject,
  dirtyTasks: PMTask[]
): Promise<WritebackResult> {
  const results: WritebackResult = { success: [], failed: [] };

  for (const task of dirtyTasks) {
    try {
      if (project.source === "github") {
        const config = project.sourceConfig as unknown as GitHubSourceConfig;
        await updateGitHubIssue(config, task.externalId, {
          title: task.title,
          body: task.description ?? undefined,
          state: task.status === "closed" ? "closed" : "open",
          labels: task.labels,
          assignees: task.assignees,
          milestone: task.milestoneExternalId ? parseInt(task.milestoneExternalId, 10) : null,
        });
      } else if (project.source === "notion") {
        const config = project.sourceConfig as unknown as NotionSourceConfig;
        await updateNotionPage(config, task.externalId, {
          title: task.title,
          status: task.status,
        });
      }

      results.success.push(task.id);
    } catch (err) {
      results.failed.push({ taskId: task.id, error: String(err) });
    }
  }

  return results;
}
