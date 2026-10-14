/**
 * パブリックイシューの一覧を組み立てる (spec/feature/public-issues.md §3〜§5)。
 * 出してよいプロジェクトは Cc の公開一覧で決める。 一覧が取れなければ何も出さない (判定できなければ出さない)。
 */
import type { CcPublicClient } from "./cc-public-client.js";
import { composeProjectIssues, type PublicIssueTaskRow } from "./public-view.js";
import { BOUNTY_TASK_SOURCE, type PublicIssuesResponse } from "./types.js";

export interface PublicIssueTaskSource {
  findPublicIssues(projectCode: string): Promise<PublicIssueTaskRow[]>;
  findBySourceRefs(source: string, sourceRefs: readonly string[]): Promise<PublicIssueTaskRow[]>;
}

export interface PublicIssuesDeps {
  cc: CcPublicClient;
  tasks: PublicIssueTaskSource;
}

/** project を指定したときは、 そのコードが公開一覧にあるときだけ返す */
export async function loadPublicIssues(deps: PublicIssuesDeps, project?: string): Promise<PublicIssuesResponse> {
  const publicCodes = await deps.cc.publicProjectCodes();
  if (!publicCodes) return { projects: [] };
  const codes = project === undefined ? publicCodes : publicCodes.filter((code) => code === project);
  const projects = await Promise.all(codes.map(async (code) => {
    const [reports, tasks] = await Promise.all([deps.cc.publicReports(code), deps.tasks.findPublicIssues(code)]);
    const bountyTasks = reports
      ? await deps.tasks.findBySourceRefs(BOUNTY_TASK_SOURCE, reports.map((report) => report.reportId))
      : [];
    return composeProjectIssues({ project: code, reports, tasks, bountyTasks });
  }));
  return { projects };
}
