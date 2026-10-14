/**
 * パブリックイシューの行を組み立てる純関数 (spec/feature/public-issues.md §3)。
 * 公開する項目は types.ts の形に固定し、 タスクの本文・要件・担当者・作成者はここで落とす。
 */
import { BOUNTY_TASK_SOURCE, type PublicBountyReport, type PublicProjectIssues, type PublicTaskIssue } from "./types.js";
import { contract } from '../../src/contract-runtime.js'; /* augur-inject:import:faad5efb */
import augurContract_7354792d from '../../contracts/public-task-issue.contract.ts'; /* augur-inject:contract-predicate:4ef4ab48 */
import augurContract_7bf88290 from '../../contracts/public-issues-compose.contract.ts'; /* augur-inject:contract-predicate:227b7d22 */

/** 公開面に渡す前のタスク行 (DB 行の一部)。 余計な列が来てもここで落とす */
export interface PublicIssueTaskRow {
  id: string;
  title: string;
  publicSummary: string | null;
  status: string;
  priority: string;
  source: string | null;
  sourceRef: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toPublicTaskIssue(task: PublicIssueTaskRow): PublicTaskIssue {
  return {
    id: task.id,
    title: task.title,
    summary: task.publicSummary ?? null,
    status: task.status,
    priority: task.priority,
    createdAt: iso(task.createdAt),
    completedAt: iso(task.completedAt),
  };
}
// @ts-expect-error augur-inject
toPublicTaskIssue = contract(toPublicTaskIssue, { ...augurContract_7354792d, contractId: 'C-15', mode: 'observe', sample: 1, where: 'modules/public-issues/public-view.ts:24', rule: 'contract-wrap', id: '7354792d' }); /* augur-inject:contract-wrap:7354792d */

export interface ComposeProjectIssuesInput {
  project: string;
  /** null = Cc に届かなかった */
  reports: PublicBountyReport[] | null;
  /** 公開プロジェクトの kind=issue で public_hidden でないタスク */
  tasks: PublicIssueTaskRow[];
  /** 報告 id (sourceRef) で引いたバウンティ由来のタスク */
  bountyTasks: PublicIssueTaskRow[];
}

export function composeProjectIssues(input: ComposeProjectIssuesInput): PublicProjectIssues {
  const statusByReport = new Map(
    input.bountyTasks
      .filter((task) => task.source === BOUNTY_TASK_SOURCE && task.sourceRef)
      .map((task) => [task.sourceRef as string, task.status]),
  );
  const bounty = input.reports === null
    ? { available: false as const }
    : {
      available: true as const,
      issues: input.reports.map((report) => ({ ...report, taskStatus: statusByReport.get(report.reportId) ?? null })),
    };
  return {
    project: input.project,
    bounty,
    // Bounty-sourced tasks belong to the bounty rows only; listing them here would show the same issue twice.
    issues: input.tasks.filter((task) => task.source !== BOUNTY_TASK_SOURCE).map(toPublicTaskIssue),
  };
}
// @ts-expect-error augur-inject
composeProjectIssues = contract(composeProjectIssues, { ...augurContract_7bf88290, contractId: 'C-16', mode: 'observe', sample: 1, where: 'modules/public-issues/public-view.ts:46', rule: 'contract-wrap', id: '7bf88290' }); /* augur-inject:contract-wrap:7bf88290 */
