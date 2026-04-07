import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { pmApi } from "../lib/api";
import type { PMProject, PMTask, PMConflict } from "../lib/api-types";
import { useWsEvents } from "../hooks/useWsEvent";

const STATUS_LABELS: Record<string, string> = {
  open: "未着手",
  in_progress: "進行中",
  review: "レビュー中",
  closed: "完了",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "緊急",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6E7681",
  medium: "#D29922",
  high: "#DA3633",
  critical: "#F85149",
};

export function PMProjectPage() {
  useAuth(); // require authentication
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<PMProject | null>(null);
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [conflicts, setConflicts] = useState<PMConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<PMTask | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [proj, taskRes, conflictRes] = await Promise.all([
        pmApi.getProject(projectId),
        pmApi.listTasks(projectId),
        pmApi.listConflicts(projectId),
      ]);
      setProject(proj);
      setTasks(taskRes.tasks);
      setConflicts(conflictRes.conflicts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // WS リアルタイム通知: PM 同期・タスク更新時に自動リフレッシュ
  useWsEvents(
    ["pm.sync_completed", "pm.task_updated"],
    useCallback((payload) => {
      if (payload.projectId === projectId) {
        fetchData();
      }
    }, [projectId, fetchData]),
  );

  const handleSync = async () => {
    if (!projectId) return;
    setSyncing(true);
    try {
      const result = await pmApi.triggerSync(projectId);
      alert(`同期完了: 新規${result.result.created}件, 更新${result.result.updated}件, 完了${result.result.closed}件`);
      fetchData();
    } catch (err) {
      alert(`同期エラー: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="page-container"><p>読み込み中...</p></div>;
  if (error) return <div className="page-container"><p className="text-error">エラー: {error}</p></div>;
  if (!project) return <div className="page-container"><p>プロジェクトが見つかりません</p></div>;

  const filteredTasks = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const statusCounts: Record<string, number> = {};
  for (const t of tasks) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <button className="btn btn-sm" onClick={() => navigate("/pm")} style={{ marginRight: "0.5rem" }}>
            ← 一覧
          </button>
          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>{project.name}</span>
          <span className="badge" style={{ marginLeft: "0.5rem" }}>{project.source}</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? "同期中..." : "同期実行"}
          </button>
          <button className="btn" onClick={() => navigate(`/pm/${projectId}/analytics`)}>
            分析
          </button>
        </div>
      </div>

      {/* ステータスサマリー */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          className={`btn btn-sm ${filter === "all" ? "btn-primary" : ""}`}
          onClick={() => setFilter("all")}
        >
          全て ({tasks.length})
        </button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`btn btn-sm ${filter === key ? "btn-primary" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label} ({statusCounts[key] ?? 0})
          </button>
        ))}
      </div>

      {/* コンフリクト警告 */}
      {conflicts.length > 0 && (
        <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", borderLeft: "3px solid var(--color-warning)" }}>
          <strong>コンフリクト: {conflicts.length}件</strong>
          <span style={{ marginLeft: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            同期中に競合が検出されました
          </span>
        </div>
      )}

      {/* タスクテーブル */}
      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>ステータス</th>
              <th style={thStyle}>優先度</th>
              <th style={thStyle}>担当者</th>
              <th style={thStyle}>納期</th>
              <th style={thStyle}>マイルストーン</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <tr
                key={task.id}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedTask(task)}
              >
                <td style={tdStyle}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{task.title}</span>
                    {task.externalUrl && (
                      <a
                        href={task.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}
                      >
                        #{task.externalId}
                      </a>
                    )}
                  </div>
                  {task.labels && task.labels.length > 0 && (
                    <div style={{ marginTop: "0.25rem" }}>
                      {task.labels.map((l: string) => (
                        <span key={l} className="badge" style={{ marginRight: "0.25rem", fontSize: "0.7rem" }}>
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  <span className="badge">{STATUS_LABELS[task.status] ?? task.status}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: PRIORITY_COLORS[task.priority] ?? "inherit", fontWeight: 500 }}>
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </span>
                </td>
                <td style={tdStyle}>
                  {task.assignees && task.assignees.length > 0 ? task.assignees.join(", ") : "-"}
                </td>
                <td style={tdStyle}>
                  {task.dueDate ?? "-"}
                </td>
                <td style={tdStyle}>
                  {task.milestoneName ?? "-"}
                </td>
              </tr>
            ))}
            {filteredTasks.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>
                  タスクがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* タスク詳細モーダル */}
      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.875rem",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.875rem",
};

function TaskDetailModal({ task, onClose }: { task: PMTask; onClose: () => void }) {
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ score: number; issues: { type: string; message: string; severity: string }[]; suggestions: string[] } | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await pmApi.validateTask(task.id);
      setValidation(result);
    } catch (err) {
      alert(`検証エラー: ${(err as Error).message}`);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding: "1.5rem", maxWidth: "600px", width: "90%", maxHeight: "80vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: 0 }}>{task.title}</h3>
          <button className="btn btn-sm" onClick={onClose}>×</button>
        </div>

        {task.externalUrl && (
          <a href={task.externalUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.875rem" }}>
            外部リンク (#{task.externalId})
          </a>
        )}

        <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.875rem" }}>
          <div><strong>ステータス:</strong> {STATUS_LABELS[task.status] ?? task.status}</div>
          <div><strong>優先度:</strong> {PRIORITY_LABELS[task.priority] ?? task.priority}</div>
          <div><strong>担当者:</strong> {task.assignees?.join(", ") || "-"}</div>
          <div><strong>納期:</strong> {task.dueDate ?? "-"}</div>
          <div><strong>見積工数:</strong> {task.estimatedHours ? `${task.estimatedHours}h` : "-"}</div>
          <div><strong>マイルストーン:</strong> {task.milestoneName ?? "-"}</div>
        </div>

        {task.description && (
          <div style={{ marginTop: "1rem" }}>
            <strong>説明:</strong>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", background: "var(--bg-secondary)", padding: "0.75rem", borderRadius: "4px", marginTop: "0.25rem" }}>
              {task.description}
            </pre>
          </div>
        )}

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-sm" onClick={handleValidate} disabled={validating}>
            {validating ? "検証中..." : "タスク検証"}
          </button>
        </div>

        {validation && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "4px" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
              充実度スコア: {validation.score}/100
            </div>
            {validation.issues.length > 0 && (
              <div>
                <strong>問題点:</strong>
                <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
                  {validation.issues.map((issue, i) => (
                    <li key={i} style={{ color: issue.severity === "error" ? "var(--color-error)" : issue.severity === "warning" ? "var(--color-warning)" : "inherit" }}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validation.suggestions.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <strong>改善提案:</strong>
                <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
                  {validation.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
