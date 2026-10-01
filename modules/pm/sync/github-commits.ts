/**
 * GitHub の関連コミット・変更ファイル・ファイル一覧の取得 (PLAN §3.2)
 */

import type { GitHubSourceConfig } from "../types.js";

const GITHUB_API_TIMEOUT_MS = 30_000;
/** 1 タスクで詳細を取りに行くコミット数の上限 (API の消費を抑える) */
export const MAX_COMMITS_PER_TASK = 20;

export interface RelatedCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

async function githubGet<T>(config: GitHubSourceConfig, path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
    },
    signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function repoPath(config: GitHubSourceConfig): string {
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

interface CommitSearchResponse {
  items: {
    sha: string;
    commit: { message: string; author: { name: string; date: string } | null };
  }[];
}

/** Issue 番号 (#123) を本文に含むコミットを新しい順に探す。 */
export async function searchIssueCommits(
  config: GitHubSourceConfig,
  issueNumber: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RelatedCommit[]> {
  const q = encodeURIComponent(`repo:${config.owner}/${config.repo} "#${issueNumber}"`);
  const data = await githubGet<CommitSearchResponse>(
    config,
    `/search/commits?q=${q}&sort=committer-date&order=desc&per_page=${MAX_COMMITS_PER_TASK}`,
    fetchImpl,
  );
  // 検索は語の一致なので、#12 の検索に #123 が混ざる。境界つきで絞る
  const mention = new RegExp(`#${issueNumber}(?!\\d)`);
  return data.items
    .filter((item) => mention.test(item.commit.message))
    .map((item) => ({
      hash: item.sha,
      message: item.commit.message.split("\n")[0],
      author: item.commit.author?.name ?? "",
      date: item.commit.author?.date ?? "",
    }));
}

export async function fetchCommitFiles(
  config: GitHubSourceConfig,
  sha: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const data = await githubGet<{ files?: { filename: string }[] }>(config, `${repoPath(config)}/commits/${encodeURIComponent(sha)}`, fetchImpl);
  return (data.files ?? []).map((f) => f.filename);
}

/** 既定ブランチのファイル一覧。巨大で切り詰められた場合は null (照合できない)。 */
export async function fetchRepositoryFiles(
  config: GitHubSourceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const repo = await githubGet<{ default_branch: string }>(config, repoPath(config), fetchImpl);
  const tree = await githubGet<{ truncated: boolean; tree: { path: string; type: string }[] }>(
    config,
    `${repoPath(config)}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
    fetchImpl,
  );
  if (tree.truncated) return null;
  return tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
}
