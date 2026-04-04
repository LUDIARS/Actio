/**
 * GitHub Issues 双方向同期
 */

import type { GitHubSourceConfig, ExternalTask, ExternalMilestone, PMTaskStatus, PMPriority } from "../types.js";

/** GitHub API リクエストのタイムアウト (30秒) */
const GITHUB_API_TIMEOUT_MS = 30_000;

interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  labels: { name: string }[];
  assignees: { login: string }[];
  milestone: { number: number; title: string; description: string; due_on: string | null; state: string; updated_at: string } | null;
  updated_at: string;
  created_at: string;
}

interface GitHubMilestone {
  number: number;
  title: string;
  description: string;
  due_on: string | null;
  state: string;
  updated_at: string;
}

/**
 * GitHub Issue のステータスを PMTaskStatus にマッピング
 */
function mapGitHubStatus(state: string, labels: string[]): PMTaskStatus {
  if (state === "closed") return "closed";
  if (labels.includes("in-review") || labels.includes("review")) return "review";
  if (labels.includes("in-progress") || labels.includes("wip")) return "in_progress";
  return "open";
}

/**
 * ラベルから優先度を推定
 */
function mapPriority(labels: string[]): PMPriority {
  if (labels.includes("critical") || labels.includes("P0")) return "critical";
  if (labels.includes("high") || labels.includes("P1")) return "high";
  if (labels.includes("low") || labels.includes("P3")) return "low";
  return "medium";
}

/**
 * GitHub Issues を取得
 */
export async function fetchGitHubIssues(config: GitHubSourceConfig): Promise<ExternalTask[]> {
  const { owner, repo, token } = config;
  const issues: GitHubIssue[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GitHubIssue[];
    if (data.length === 0) break;

    // PR は除外 (pull_request プロパティがないものだけ)
    const issuesOnly = data.filter(
      (d) => !(d as unknown as Record<string, unknown>).pull_request
    );
    issues.push(...issuesOnly);
    page++;

    if (data.length < 100) break;
  }

  return issues.map((issue) => {
    const labelNames = issue.labels.map((l) => l.name);
    return {
      externalId: String(issue.number),
      externalUrl: issue.html_url,
      title: issue.title,
      description: issue.body,
      status: mapGitHubStatus(issue.state, labelNames),
      priority: mapPriority(labelNames),
      assignees: issue.assignees.map((a) => a.login),
      labels: labelNames,
      dueDate: issue.milestone?.due_on?.split("T")[0] ?? null,
      milestoneExternalId: issue.milestone ? String(issue.milestone.number) : null,
      milestoneName: issue.milestone?.title ?? null,
      updatedAt: issue.updated_at,
    };
  });
}

/**
 * GitHub Milestones を取得
 */
export async function fetchGitHubMilestones(config: GitHubSourceConfig): Promise<ExternalMilestone[]> {
  const { owner, repo, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/milestones?state=all&per_page=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const milestones = (await res.json()) as GitHubMilestone[];
  return milestones.map((m) => ({
    externalId: String(m.number),
    title: m.title,
    description: m.description,
    dueDate: m.due_on?.split("T")[0] ?? null,
    state: m.state as "open" | "closed",
    updatedAt: m.updated_at,
  }));
}

/**
 * GitHub Issue を更新 (書き戻し)
 */
export async function updateGitHubIssue(
  config: GitHubSourceConfig,
  issueNumber: string,
  data: {
    title?: string;
    body?: string;
    state?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number | null;
  }
): Promise<void> {
  const { owner, repo, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error on update: ${res.status} ${res.statusText}`);
  }
}
