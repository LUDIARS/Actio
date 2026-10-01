import { useCallback, useEffect, useState } from "react";
import { pmApi } from "../../lib/api";
import type { PMSyncStatus } from "../../lib/api-types";

const STATUS_TEXT: Record<PMSyncStatus["status"], string> = {
  idle: "待機中",
  syncing: "同期中",
  error: "前回エラー",
};

/** 同期の状態と前回結果。定期同期は同期間隔ごとにサーバーが実行する。 */
export function PMSyncStatusPanel({ projectId, syncIntervalMinutes, refreshKey }: { projectId: string; syncIntervalMinutes: number; refreshKey: number }) {
  const [status, setStatus] = useState<PMSyncStatus | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await pmApi.getSyncStatus(projectId));
    } catch {
      setStatus(null);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!status) return null;
  const result = status.lastResult;
  return (
    <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <span><strong>同期状態:</strong> {STATUS_TEXT[status.status]}</span>
        <span><strong>最終成功:</strong> {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "未同期"}</span>
        <span><strong>定期同期:</strong> {syncIntervalMinutes} 分ごと</span>
      </div>
      {result && (
        <div style={{ marginTop: "0.25rem", color: "var(--text-muted)" }}>
          前回: 新規 {result.created} / 更新 {result.updated} / 完了 {result.closed} / 変化なし {result.unchanged} / コンフリクト {result.conflicts}
        </div>
      )}
      {result && result.errors.length > 0 && (
        <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem", color: "var(--color-error)" }}>
          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
