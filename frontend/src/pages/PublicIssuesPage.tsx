/**
 * パブリックイシュー (認証なし, spec/feature/public-issues.md)。
 * 公開プロジェクトのバウンティのイシューと、 バウンティのないイシューを並べる。
 */
import { useEffect, useState } from "react";
import { fetchPublicIssues, type PublicBountySection, type PublicProjectIssues, type PublicTaskIssue } from "../lib/public-issues-api";
import { formatPublicDate, priorityLabel, readProjectParam, severityLabel, statusLabel } from "../lib/public-issues-format";

const cell: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--border)", verticalAlign: "top", fontSize: "0.85rem" };
const head: React.CSSProperties = { ...cell, color: "var(--text-muted)", fontWeight: 600, textAlign: "left" };
const muted: React.CSSProperties = { color: "var(--text-muted)" };

function BountyTable({ bounty }: { bounty: PublicBountySection }) {
  if (!bounty.available) return <p style={muted}>取得できません</p>;
  if (bounty.issues.length === 0) return <p style={muted}>ありません</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>題名</th><th style={head}>深刻度</th><th style={head}>状態</th>
            <th style={head}>報告者</th><th style={head}>報奨</th><th style={head}>受付</th><th style={head}>反映</th>
          </tr>
        </thead>
        <tbody>
          {bounty.issues.map((issue) => (
            <tr key={issue.reportId}>
              <td style={cell}>
                <div style={{ fontWeight: 600 }}>{issue.title}</div>
                {issue.summary && <div style={muted}>{issue.summary}</div>}
              </td>
              <td style={cell}>{severityLabel(issue.severity)}</td>
              <td style={cell}>{statusLabel(issue.taskStatus ?? issue.status)}</td>
              <td style={cell}>{issue.publicName ?? "—"}</td>
              <td style={cell}>{issue.rewardTokens ?? "—"}</td>
              <td style={cell}>{formatPublicDate(issue.receivedAt)}</td>
              <td style={cell}>{formatPublicDate(issue.deployedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueTable({ issues }: { issues: PublicTaskIssue[] }) {
  if (issues.length === 0) return <p style={muted}>ありません</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>題名</th><th style={head}>状態</th><th style={head}>優先度</th>
            <th style={head}>作成</th><th style={head}>完了</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.id}>
              <td style={cell}>
                <div style={{ fontWeight: 600 }}>{issue.title}</div>
                {issue.summary && <div style={muted}>{issue.summary}</div>}
              </td>
              <td style={cell}>{statusLabel(issue.status)}</td>
              <td style={cell}>{priorityLabel(issue.priority)}</td>
              <td style={cell}>{formatPublicDate(issue.createdAt)}</td>
              <td style={cell}>{formatPublicDate(issue.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectSection({ project }: { project: PublicProjectIssues }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>{project.project}</h2>
      <h3 style={{ fontSize: "0.95rem", margin: "0.5rem 0" }}>バウンティのイシュー</h3>
      <BountyTable bounty={project.bounty} />
      <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem" }}>イシュー</h3>
      <IssueTable issues={project.issues} />
    </section>
  );
}

export function PublicIssuesPage() {
  const [projects, setProjects] = useState<PublicProjectIssues[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublicIssues(readProjectParam(window.location.search), controller.signal)
      .then((body) => setProjects(body.projects))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("[PublicIssues] 取得に失敗しました:", err);
        setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem", minHeight: "100vh" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "1.25rem" }}>パブリックイシュー</h1>
      {loading && <p style={muted}>読み込み中...</p>}
      {!loading && failed && <p style={muted}>取得できません</p>}
      {projects.map((project) => <ProjectSection key={project.project} project={project} />)}
    </main>
  );
}
