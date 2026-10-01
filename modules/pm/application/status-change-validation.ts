/**
 * ステータス変更時検証ユースケース (PLAN §3.2, completion.md AT-PM-VALIDATION)
 *
 * review に変わったタスクについて、Issue 番号を含むコミットとその変更ファイルを集め、
 * 対応テストを照合して検証結果に記録する。GitHub 以外・取得失敗は unknown。
 */

import { validateTask } from "../validation/task-validator.js";
import { matchTestFiles, type TestCoverage } from "../validation/test-matching.js";
import type { RelatedCommit } from "../sync/github-commits.js";
import type { PmTaskRow, PmValidationStore } from "./ports.js";

export interface CommitSource {
  searchIssueCommits: (issueNumber: string) => Promise<RelatedCommit[]>;
  fetchCommitFiles: (sha: string) => Promise<string[]>;
  fetchRepositoryFiles: () => Promise<string[] | null>;
}

export interface StatusChangeValidation {
  taskId: string;
  relatedCommits: RelatedCommit[];
  affectedFiles: string[];
  testFiles: string[];
  testCoverage: TestCoverage;
  error: string | null;
}

export async function collectStatusChangeEvidence(task: Pick<PmTaskRow, "id" | "externalId">, source: CommitSource | null): Promise<StatusChangeValidation> {
  const empty: StatusChangeValidation = {
    taskId: task.id,
    relatedCommits: [],
    affectedFiles: [],
    testFiles: [],
    testCoverage: "unknown",
    error: null,
  };
  if (!source) return { ...empty, error: "このソースは関連コミットの取得に対応していません" };
  try {
    const relatedCommits = await source.searchIssueCommits(task.externalId);
    const files = new Set<string>();
    for (const commit of relatedCommits) {
      for (const file of await source.fetchCommitFiles(commit.hash)) files.add(file);
    }
    const affectedFiles = [...files].sort();
    const repositoryFiles = affectedFiles.length > 0 ? await source.fetchRepositoryFiles() : null;
    const { testFiles, testCoverage } = matchTestFiles(affectedFiles, repositoryFiles);
    return { taskId: task.id, relatedCommits, affectedFiles, testFiles, testCoverage, error: null };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 内容検証と関連コミットをまとめて 1 件の検証結果として保存する。 */
export async function recordStatusChangeValidation(
  task: PmTaskRow,
  source: CommitSource | null,
  store: PmValidationStore,
  newId: () => string,
): Promise<StatusChangeValidation> {
  const evidence = await collectStatusChangeEvidence(task, source);
  const content = validateTask({
    id: task.id,
    title: task.title,
    description: task.description,
    labels: task.labels ?? [],
    estimatedHours: task.estimatedHours,
    blockedBy: task.blockedBy ?? [],
    status: task.status,
  });
  await store.createValidation({
    id: newId(),
    taskId: task.id,
    score: content.score,
    issues: evidence.error
      ? [...content.issues, { type: "related_commits_unavailable", message: evidence.error, severity: "info" }]
      : content.issues,
    suggestions: content.suggestions,
    relatedCommits: evidence.relatedCommits,
    testFiles: evidence.testFiles,
    validatedAt: content.validatedAt,
  });
  return evidence;
}
