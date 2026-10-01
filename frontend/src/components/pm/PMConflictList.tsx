import { useState } from "react";
import { pmApi } from "../../lib/api";
import type { PMConflict } from "../../lib/api-types";

const FIELDS = ["title", "description", "status", "priority", "assignees", "labels", "dueDate", "milestoneName"] as const;

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ") || "-";
  return String(value);
}

/** 解決待ちのコンフリクト。外部採用・Actio 側採用・LLM マージを選べる。 */
export function PMConflictList({ conflicts, onResolved }: { conflicts: PMConflict[]; onResolved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (conflicts.length === 0) return null;

  const run = async (conflictId: string, action: () => Promise<unknown>) => {
    setBusy(conflictId);
    setError("");
    try {
      await action();
      onResolved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", borderLeft: "3px solid var(--color-warning)", fontSize: "0.875rem" }}>
      <strong>解決待ちのコンフリクト: {conflicts.length}件</strong>
      <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)" }}>Actio と外部の両方で同じ項目が変更されました</span>
      {error && <p className="text-error" style={{ margin: "0.5rem 0 0" }}>{error}</p>}
      {conflicts.map((conflict) => {
        const changed = FIELDS.filter((f) => show(conflict.localVersion[f]) !== show(conflict.externalVersion[f]));
        return (
          <div key={conflict.id} style={{ marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 500 }}>{show(conflict.externalVersion.title)}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.25rem" }}>
              <thead>
                <tr><th style={cell}>項目</th><th style={cell}>Actio 側</th><th style={cell}>外部</th></tr>
              </thead>
              <tbody>
                {changed.map((f) => (
                  <tr key={f}>
                    <td style={cell}>{f}</td>
                    <td style={cell}>{show(conflict.localVersion[f])}</td>
                    <td style={cell}>{show(conflict.externalVersion[f])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button className="btn btn-sm" disabled={busy !== null} onClick={() => run(conflict.id, () => pmApi.resolveConflict(conflict.id, { resolution: "force_external" }))}>外部を採用</button>
              <button className="btn btn-sm" disabled={busy !== null} onClick={() => run(conflict.id, () => pmApi.resolveConflict(conflict.id, { resolution: "keep_local" }))}>Actio 側を採用</button>
              <button className="btn btn-sm" disabled={busy !== null} onClick={() => run(conflict.id, () => pmApi.autoMergeConflict(conflict.id))}>
                {busy === conflict.id ? "処理中..." : "LLM でマージ"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const cell: React.CSSProperties = { textAlign: "left", padding: "0.25rem 0.5rem", borderBottom: "1px solid var(--border)", verticalAlign: "top", whiteSpace: "pre-wrap" };
