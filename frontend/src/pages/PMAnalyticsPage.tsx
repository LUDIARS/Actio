import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { pmApi } from "../lib/api";
import type {
  PMProgressReport,
  PMCriticalPathResult,
  PMDecompositionRecommendation,
  PMGompertzReport,
} from "../lib/api-types";

const STATUS_LABELS: Record<string, string> = {
  open: "未着手",
  in_progress: "進行中",
  review: "レビュー中",
  closed: "完了",
};

const RISK_LABELS: Record<string, string> = {
  low: "低リスク",
  medium: "中リスク",
  high: "高リスク",
  critical: "重大リスク",
};

const RISK_COLORS: Record<string, string> = {
  low: "#3FB950",
  medium: "#D29922",
  high: "#DA3633",
  critical: "#F85149",
};

export function PMAnalyticsPage() {
  useAuth(); // require authentication
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<PMProgressReport | null>(null);
  const [criticalPath, setCriticalPath] = useState<PMCriticalPathResult | null>(null);
  const [decomposition, setDecomposition] = useState<PMDecompositionRecommendation[]>([]);
  const [gompertz, setGompertz] = useState<PMGompertzReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"progress" | "critical" | "decomposition" | "gompertz">("progress");

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [prog, cp, decomp, gomp] = await Promise.all([
        pmApi.getProgress(projectId),
        pmApi.getCriticalPath(projectId),
        pmApi.getDecomposition(projectId),
        pmApi.getGompertz(projectId).catch(() => null),
      ]);
      setProgress(prog);
      setCriticalPath(cp);
      setDecomposition(decomp.recommendations);
      setGompertz(gomp);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="page-container"><p>読み込み中...</p></div>;
  if (error) return <div className="page-container"><p className="text-error">エラー: {error}</p></div>;

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <button className="btn btn-sm" onClick={() => navigate(`/pm/${projectId}`)} style={{ marginRight: "0.5rem" }}>
            ← タスク
          </button>
          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>分析ダッシュボード</span>
        </div>
      </div>

      {/* タブ切替 */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {([
          ["progress", "進捗"],
          ["critical", "クリティカルパス"],
          ["decomposition", "タスク分解"],
          ["gompertz", "バグ収束"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`btn btn-sm ${activeTab === key ? "btn-primary" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 進捗タブ */}
      {activeTab === "progress" && progress && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <StatCard label="総タスク数" value={String(progress.totalTasks)} />
            <StatCard label="完了タスク" value={String(progress.completedTasks)} />
            <StatCard label="完了率" value={`${Math.round(progress.completionRate * 100)}%`} />
          </div>

          {/* 進捗バー */}
          <div className="card" style={{ padding: "1rem" }}>
            <h4 style={{ marginTop: 0 }}>プロジェクト進捗</h4>
            <div style={{ background: "var(--bg-secondary)", borderRadius: "4px", height: "24px", overflow: "hidden" }}>
              <div
                style={{
                  background: "var(--color-primary)",
                  height: "100%",
                  width: `${Math.round(progress.completionRate * 100)}%`,
                  transition: "width 0.3s",
                  borderRadius: "4px",
                }}
              />
            </div>

            <h4>ステータス別</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.5rem" }}>
              {Object.entries(progress.tasksByStatus).map(([status, count]) => (
                <div key={status} style={{ padding: "0.5rem", background: "var(--bg-secondary)", borderRadius: "4px", textAlign: "center" }}>
                  <div style={{ fontWeight: 600 }}>{count}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{STATUS_LABELS[status] ?? status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* クリティカルパスタブ */}
      {activeTab === "critical" && criticalPath && (
        <div className="card" style={{ padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h4 style={{ margin: 0 }}>クリティカルパス</h4>
            <span style={{ color: RISK_COLORS[criticalPath.riskLevel], fontWeight: 600 }}>
              {RISK_LABELS[criticalPath.riskLevel] ?? criticalPath.riskLevel}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
            <div><strong>推定所要日数:</strong> {criticalPath.totalEstimatedDays}日</div>
            <div><strong>完了予測日:</strong> {criticalPath.projectedCompletionDate}</div>
          </div>

          {criticalPath.path.length > 0 ? (
            <div>
              {criticalPath.path.map((node, i) => (
                <div
                  key={node.taskId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.5rem",
                    borderLeft: "2px solid var(--color-primary)",
                    marginLeft: "0.5rem",
                    marginBottom: i < criticalPath.path.length - 1 ? "0" : undefined,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{node.title}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {node.assignee} · {node.estimatedDays}日 · {STATUS_LABELS[node.status] ?? node.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>依存関係のあるタスクがありません</p>
          )}
        </div>
      )}

      {/* タスク分解タブ */}
      {activeTab === "decomposition" && (
        <div className="card" style={{ padding: "1rem" }}>
          <h4 style={{ marginTop: 0 }}>タスク分解推奨</h4>
          {decomposition.length > 0 ? (
            <div>
              {decomposition.map((rec) => (
                <div key={rec.taskId} style={{ padding: "0.75rem", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 500 }}>
                    {rec.title}
                    {rec.onCriticalPath && <span className="badge" style={{ marginLeft: "0.5rem", fontSize: "0.7rem" }}>クリティカルパス</span>}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {rec.reason}
                  </div>
                  <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                    見積: {rec.estimatedHours ? `${rec.estimatedHours}h` : "-"} · 依存タスク数: {rec.dependencyCount}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>分解推奨タスクはありません</p>
          )}
        </div>
      )}

      {/* ゴンペルツタブ */}
      {activeTab === "gompertz" && (
        <div className="card" style={{ padding: "1rem" }}>
          <h4 style={{ marginTop: 0 }}>バグ収束予測 (ゴンペルツ曲線)</h4>
          {gompertz && gompertz.estimatedTotalBugs > 0 ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
                <StatCard label="発見済みバグ" value={String(gompertz.totalBugsFound)} />
                <StatCard label="修正済みバグ" value={String(gompertz.totalBugsFixed)} />
                <StatCard label="推定総バグ数" value={String(gompertz.estimatedTotalBugs)} />
                <StatCard label="信頼度" value={`${Math.round(gompertz.confidenceLevel * 100)}%`} />
              </div>
              {gompertz.convergenceDate && (
                <p><strong>95%収束予測日:</strong> {gompertz.convergenceDate}</p>
              )}

              {/* データテーブル */}
              {gompertz.dataPoints.length > 0 && (
                <div style={{ overflow: "auto", marginTop: "1rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>日付</th>
                        <th style={thStyle}>累積発見</th>
                        <th style={thStyle}>累積修正</th>
                        <th style={thStyle}>予測値</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gompertz.dataPoints.map((dp, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{dp.date}</td>
                          <td style={tdStyle}>{dp.cumulativeFound}</td>
                          <td style={tdStyle}>{dp.cumulativeFixed}</td>
                          <td style={tdStyle}>{dp.predicted.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>
              バグデータが不十分です。「bug」ラベル付きタスクが3件以上必要です。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: "0.75rem", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem",
  borderBottom: "1px solid var(--border)",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem",
  borderBottom: "1px solid var(--border)",
};
