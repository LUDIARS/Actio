/**
 * パブリックイシューの公開形 (spec/feature/public-issues.md §3)。
 * ここに無い項目は公開面へ出さない。 項目を足すときは spec と契約 (C-14 / C-15) を先に直す。
 */

export const BOUNTY_TASK_SOURCE = "concordia.bounty.v1";

export type BountySeverity = "s1" | "s2" | "s3" | "s4";

/** Cc `GET /v1/bounty/public-reports` の 1 件から取り出す公開項目 */
export interface PublicBountyReport {
  /** 報告 id (= Actio タスクの sourceRef) */
  reportId: string;
  title: string;
  summary: string | null;
  severity: BountySeverity | null;
  /** Cc 側の報告の状態 */
  status: string | null;
  /** 報告者の公開名 */
  publicName: string | null;
  rewardTokens: number | null;
  receivedAt: string | null;
  deployedAt: string | null;
}

/** バウンティのイシューの行。 対応する Actio タスクの状態を添える */
export interface PublicBountyIssue extends PublicBountyReport {
  taskStatus: string | null;
}

/** バウンティのないイシューの行 */
export interface PublicTaskIssue {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  priority: string;
  createdAt: string | null;
  completedAt: string | null;
}

export type PublicBountySection =
  | { available: true; issues: PublicBountyIssue[] }
  | { available: false };

export interface PublicProjectIssues {
  project: string;
  bounty: PublicBountySection;
  issues: PublicTaskIssue[];
}

export interface PublicIssuesResponse {
  projects: PublicProjectIssues[];
}
