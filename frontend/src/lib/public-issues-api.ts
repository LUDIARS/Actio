/**
 * パブリックイシュー `GET /api/public/issues` (認証なし)。 ログイン情報は送らない。
 * 応答の形はバックエンドの modules/public-issues/types.ts と揃える。
 */

export interface PublicBountyIssue {
  reportId: string;
  title: string;
  summary: string | null;
  severity: "s1" | "s2" | "s3" | "s4" | null;
  status: string | null;
  publicName: string | null;
  rewardTokens: number | null;
  receivedAt: string | null;
  deployedAt: string | null;
  taskStatus: string | null;
}

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

export async function fetchPublicIssues(project: string | null, signal?: AbortSignal): Promise<PublicIssuesResponse> {
  const query = project ? `?project=${encodeURIComponent(project)}` : "";
  const response = await fetch(`/api/public/issues${query}`, { credentials: "omit", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as PublicIssuesResponse;
}
