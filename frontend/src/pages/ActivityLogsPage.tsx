import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { activityLogApi } from "../lib/api";

interface ActivityLogEntry {
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  detail: string;
}

export function ActivityLogsPage() {
  useAuth();

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await activityLogApi.getLogs();
      setLogs(data.logs || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-muted)" }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>操作ログ</h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
            DB更新操作の履歴（最新50件）
          </p>
        </div>
        <button
          onClick={fetchLogs}
          style={{
            padding: "0.4rem 0.8rem",
            fontSize: "0.8rem",
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          更新
        </button>
      </div>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          background: "rgba(255,0,0,0.08)",
          border: "1px solid rgba(255,0,0,0.2)",
          borderRadius: "var(--radius-sm)",
          color: "var(--red)",
          fontSize: "0.85rem",
        }}>
          {error}
        </div>
      )}

      {logs.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "3rem 1rem",
          color: "var(--text-muted)",
          fontSize: "0.9rem",
        }}>
          操作ログはまだありません
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                padding: "0.75rem 1rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.3rem" }}>
                <span style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--accent)",
                  background: "var(--bg-surface-2)",
                  padding: "0.1rem 0.4rem",
                  borderRadius: "var(--radius-sm)",
                }}>
                  {log.action}
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0, marginLeft: "0.5rem" }}>
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.2rem" }}>
                {log.detail}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                実行者: {log.userName}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
