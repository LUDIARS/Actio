import { useState } from "react";
import { pmApi } from "../../lib/api";
import type { PMRelatedCommits, PMTestCoverage } from "../../lib/api-types";

const COVERAGE_TEXT: Record<PMTestCoverage["testCoverage"], string> = {
  found: "対応テストあり",
  missing: "対応テストが見つかりません",
  unknown: "判定できません",
};

/** Issue 番号を含むコミットと、その変更に対応するテスト (GitHub のみ)。 */
export function PMRelatedCommitsPanel({ taskId }: { taskId: string }) {
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<PMRelatedCommits | null>(null);
  const [coverage, setCoverage] = useState<PMTestCoverage | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [c, t] = await Promise.all([pmApi.getRelatedCommits(taskId), pmApi.getTestCoverage(taskId)]);
      setCommits(c);
      setCoverage(t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
      <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? "取得中..." : "関連コミットとテスト"}</button>
      {error && <p className="text-error">{error}</p>}
      {commits && (
        <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "4px" }}>
          {commits.error && <div style={{ color: "var(--text-muted)" }}>{commits.error}</div>}
          <strong>関連コミット ({commits.relatedCommits.length})</strong>
          <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
            {commits.relatedCommits.map((c) => (
              <li key={c.hash}><code>{c.hash.slice(0, 7)}</code> {c.message} <span style={{ color: "var(--text-muted)" }}>({c.author})</span></li>
            ))}
          </ul>
          {coverage && (
            <>
              <strong>テスト: {COVERAGE_TEXT[coverage.testCoverage]}</strong>
              <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
                {coverage.testFiles.map((f) => <li key={f}><code>{f}</code></li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
