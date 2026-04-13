import { useState, useEffect, useCallback } from "react";
import { integrationsApi, calendarApi } from "../lib/api";
import type { PersonalEvent, SyncLog } from "../lib/api-types";

export function IntegrationsPage() {
  // Google Calendar state
  const [gcalStatus, setGcalStatus] = useState<{
    connected: boolean;
    hasWriteScope: boolean;
    syncEnabled: boolean;
  } | null>(null);
  const [gcalLogs, setGcalLogs] = useState<SyncLog[]>([]);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalResult, setGcalResult] = useState<string | null>(null);

  // Notion state
  const [notionStatus, setNotionStatus] = useState<{
    connected: boolean;
    databaseId: string | null;
    isActive: boolean;
  } | null>(null);
  const [notionToken, setNotionToken] = useState("");
  const [notionDatabases, setNotionDatabases] = useState<
    Array<{ id: string; title: string; properties: string[] }>
  >([]);
  const [notionLogs, setNotionLogs] = useState<SyncLog[]>([]);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionResult, setNotionResult] = useState<string | null>(null);
  const [notionParentPageId, setNotionParentPageId] = useState("");

  // Personal events for sync
  const [events, setEvents] = useState<PersonalEvent[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"google" | "notion">("google");

  const loadData = useCallback(async () => {
    try {
      const [gcal, notionSt, eventsData] = await Promise.all([
        integrationsApi.googleCalendar.getStatus().catch(() => null),
        integrationsApi.notion.getStatus().catch(() => null),
        calendarApi.getPersonalEvents().catch(() => ({ events: [] })),
      ]);
      if (gcal) setGcalStatus(gcal);
      if (notionSt) setNotionStatus(notionSt);
      setEvents(eventsData.events || []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Google Calendar handlers ────────────────────────────

  const handleGcalEnable = async () => {
    try {
      await integrationsApi.googleCalendar.enable();
      await loadData();
      setGcalResult("Google Calendar同期を有効にしました");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleGcalDisable = async () => {
    try {
      await integrationsApi.googleCalendar.disable();
      await loadData();
      setGcalResult("Google Calendar同期を無効にしました");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleGcalPushAll = async () => {
    setGcalSyncing(true);
    setGcalResult(null);
    try {
      const result = await integrationsApi.googleCalendar.pushAll();
      setGcalResult(
        `同期完了: ${result.created}件作成, ${result.updated}件更新, ${result.errors}件失敗 (合計${result.total}件)`
      );
      // Reload logs
      const logsData = await integrationsApi.googleCalendar.getLogs();
      setGcalLogs(logsData.logs || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGcalSyncing(false);
    }
  };

  const handleGcalLoadLogs = async () => {
    try {
      const data = await integrationsApi.googleCalendar.getLogs();
      setGcalLogs(data.logs || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ─── Notion handlers ─────────────────────────────────────

  const handleNotionConnect = async () => {
    if (!notionToken.trim()) {
      setError("Notion Integration Tokenを入力してください");
      return;
    }
    try {
      await integrationsApi.notion.connect(notionToken.trim());
      setNotionToken("");
      await loadData();
      setNotionResult("Notionと接続しました");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNotionDisconnect = async () => {
    try {
      await integrationsApi.notion.disconnect();
      await loadData();
      setNotionResult("Notion連携を解除しました");
      setNotionDatabases([]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNotionListDatabases = async () => {
    try {
      const data = await integrationsApi.notion.listDatabases();
      setNotionDatabases(data.databases || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNotionSelectDb = async (databaseId: string) => {
    try {
      await integrationsApi.notion.setDatabase(databaseId);
      await loadData();
      setNotionResult("同期先データベースを設定しました");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNotionCreateDb = async () => {
    if (!notionParentPageId.trim()) {
      setError("親ページIDを入力してください");
      return;
    }
    try {
      const data = await integrationsApi.notion.createDatabase(notionParentPageId.trim());
      setNotionParentPageId("");
      await loadData();
      setNotionResult(`Schedula用データベースを作成しました (ID: ${data.databaseId})`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNotionPushAll = async () => {
    setNotionSyncing(true);
    setNotionResult(null);
    try {
      const result = await integrationsApi.notion.pushAll();
      setNotionResult(
        `同期完了: ${result.created}件作成, ${result.updated}件更新, ${result.errors}件失敗 (合計${result.total}件)`
      );
      const logsData = await integrationsApi.notion.getLogs();
      setNotionLogs(logsData.logs || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNotionSyncing(false);
    }
  };

  const handleNotionLoadLogs = async () => {
    try {
      const data = await integrationsApi.notion.getLogs();
      setNotionLogs(data.logs || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
        外部サービス連携
      </h1>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--danger-bg, #fee)",
            color: "var(--danger, #c00)",
            borderRadius: 8,
            marginBottom: "1rem",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 8, cursor: "pointer", background: "none", border: "none", color: "inherit" }}
          >
            x
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setActiveTab("google")}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: 8,
            border: "1px solid var(--border, #ddd)",
            background: activeTab === "google" ? "var(--primary, #4a90d9)" : "var(--bg, #fff)",
            color: activeTab === "google" ? "#fff" : "var(--text, #333)",
            cursor: "pointer",
            fontWeight: activeTab === "google" ? 600 : 400,
          }}
        >
          Google Calendar
        </button>
        <button
          onClick={() => setActiveTab("notion")}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: 8,
            border: "1px solid var(--border, #ddd)",
            background: activeTab === "notion" ? "var(--primary, #4a90d9)" : "var(--bg, #fff)",
            color: activeTab === "notion" ? "#fff" : "var(--text, #333)",
            cursor: "pointer",
            fontWeight: activeTab === "notion" ? 600 : 400,
          }}
        >
          Notion
        </button>
      </div>

      {/* ═══ Google Calendar Tab ═══ */}
      {activeTab === "google" && (
        <div>
          <SectionCard title="Google Calendar 同期">
            <div style={{ marginBottom: "1rem" }}>
              <StatusBadge label="接続状態" value={gcalStatus?.connected ? "接続済み" : "未接続"} ok={gcalStatus?.connected} />
              <StatusBadge label="書き込み権限" value={gcalStatus?.hasWriteScope ? "あり" : "なし"} ok={gcalStatus?.hasWriteScope} />
              <StatusBadge label="同期" value={gcalStatus?.syncEnabled ? "有効" : "無効"} ok={gcalStatus?.syncEnabled} />
            </div>

            {!gcalStatus?.connected && (
              <p style={{ color: "var(--text-muted, #888)", marginBottom: "1rem" }}>
                Google Calendar連携を行うには、まず「カレンダー」ページからGoogle認証を行ってください。
              </p>
            )}

            {gcalStatus?.connected && !gcalStatus?.hasWriteScope && (
              <p style={{ color: "var(--warning, #c90)", marginBottom: "1rem" }}>
                書き込み権限がありません。Google認証を再設定してください（ログインページから再度Google連携）。
              </p>
            )}

            {gcalStatus?.connected && gcalStatus?.hasWriteScope && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {!gcalStatus.syncEnabled ? (
                  <ActionButton onClick={handleGcalEnable} label="同期を有効化" />
                ) : (
                  <ActionButton onClick={handleGcalDisable} label="同期を無効化" variant="secondary" />
                )}
                <ActionButton
                  onClick={handleGcalPushAll}
                  label={gcalSyncing ? "同期中..." : "全予定を一括同期"}
                  disabled={gcalSyncing || !gcalStatus.syncEnabled}
                />
              </div>
            )}

            {gcalResult && (
              <div style={{ padding: "0.5rem 1rem", background: "var(--success-bg, #efe)", borderRadius: 8, marginBottom: "1rem" }}>
                {gcalResult}
              </div>
            )}

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted, #888)" }}>
              現在の手動予定: {events.length}件
            </p>
          </SectionCard>

          <SectionCard title="同期ログ">
            <ActionButton onClick={handleGcalLoadLogs} label="ログを読み込み" variant="secondary" />
            {gcalLogs.length > 0 && <LogTable logs={gcalLogs} />}
          </SectionCard>
        </div>
      )}

      {/* ═══ Notion Tab ═══ */}
      {activeTab === "notion" && (
        <div>
          <SectionCard title="Notion 連携">
            <div style={{ marginBottom: "1rem" }}>
              <StatusBadge label="接続状態" value={notionStatus?.connected ? "接続済み" : "未接続"} ok={notionStatus?.connected} />
              {notionStatus?.databaseId && (
                <StatusBadge label="同期先DB" value={notionStatus.databaseId.slice(0, 12) + "..."} ok={true} />
              )}
            </div>

            {!notionStatus?.connected ? (
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  Notion Integration Tokenを入力して接続してください。
                  <br />
                  <span style={{ color: "var(--text-muted, #888)", fontSize: "0.85rem" }}>
                    Notion &gt; Settings &gt; Integrations で Internal Integration を作成し、トークンをコピーしてください。
                  </span>
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="password"
                    placeholder="ntn_..."
                    value={notionToken}
                    onChange={(e) => setNotionToken(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "0.5rem",
                      border: "1px solid var(--border, #ddd)",
                      borderRadius: 6,
                      fontSize: "0.9rem",
                    }}
                  />
                  <ActionButton onClick={handleNotionConnect} label="接続" />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: "1rem" }}>
                <ActionButton onClick={handleNotionDisconnect} label="連携を解除" variant="danger" />
              </div>
            )}
          </SectionCard>

          {notionStatus?.connected && (
            <>
              <SectionCard title="同期先データベース設定">
                {!notionStatus.databaseId ? (
                  <div>
                    <div style={{ marginBottom: "1rem" }}>
                      <ActionButton onClick={handleNotionListDatabases} label="既存DBから選択" variant="secondary" />
                    </div>

                    {notionDatabases.length > 0 && (
                      <div style={{ marginBottom: "1rem" }}>
                        <p style={{ fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>利用可能なDB:</p>
                        {notionDatabases.map((db) => (
                          <div
                            key={db.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.5rem",
                              border: "1px solid var(--border, #ddd)",
                              borderRadius: 6,
                              marginBottom: "0.25rem",
                            }}
                          >
                            <span style={{ fontSize: "0.9rem" }}>{db.title}</span>
                            <ActionButton onClick={() => handleNotionSelectDb(db.id)} label="選択" />
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ borderTop: "1px solid var(--border, #ddd)", paddingTop: "1rem" }}>
                      <p style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                        または、Schedula用のDBを新規作成:
                      </p>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input
                          type="text"
                          placeholder="親ページID"
                          value={notionParentPageId}
                          onChange={(e) => setNotionParentPageId(e.target.value)}
                          style={{
                            flex: 1,
                            padding: "0.5rem",
                            border: "1px solid var(--border, #ddd)",
                            borderRadius: 6,
                            fontSize: "0.9rem",
                          }}
                        />
                        <ActionButton onClick={handleNotionCreateDb} label="DB作成" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                      同期先DB ID: <code>{notionStatus.databaseId}</code>
                    </p>
                    <ActionButton
                      onClick={() => {
                        setNotionDatabases([]);
                        handleNotionListDatabases();
                      }}
                      label="DBを変更"
                      variant="secondary"
                    />
                  </div>
                )}
              </SectionCard>

              <SectionCard title="予定の同期">
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                  <ActionButton
                    onClick={handleNotionPushAll}
                    label={notionSyncing ? "同期中..." : "全予定を一括同期"}
                    disabled={notionSyncing || !notionStatus.databaseId}
                  />
                </div>

                {notionResult && (
                  <div style={{ padding: "0.5rem 1rem", background: "var(--success-bg, #efe)", borderRadius: 8, marginBottom: "1rem" }}>
                    {notionResult}
                  </div>
                )}

                <p style={{ fontSize: "0.85rem", color: "var(--text-muted, #888)" }}>
                  現在の手動予定: {events.length}件
                </p>
              </SectionCard>

              <SectionCard title="同期ログ">
                <ActionButton onClick={handleNotionLoadLogs} label="ログを読み込み" variant="secondary" />
                {notionLogs.length > 0 && <LogTable logs={notionLogs} />}
              </SectionCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--border, #ddd)",
        borderRadius: 10,
        padding: "1.25rem",
        marginBottom: "1rem",
        background: "var(--card-bg, #fff)",
      }}
    >
      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.25rem 0.75rem",
        borderRadius: 20,
        fontSize: "0.8rem",
        marginRight: "0.5rem",
        marginBottom: "0.25rem",
        background: ok ? "var(--success-bg, #e6f9e6)" : "var(--muted-bg, #f0f0f0)",
        color: ok ? "var(--success, #070)" : "var(--text-muted, #888)",
        border: `1px solid ${ok ? "var(--success-border, #cec)" : "var(--border, #ddd)"}`,
      }}
    >
      {label}: {value}
    </span>
  );
}

function ActionButton({
  onClick,
  label,
  variant = "primary",
  disabled,
}: {
  onClick: () => void;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const bgMap = {
    primary: "var(--primary, #4a90d9)",
    secondary: "var(--bg, #f5f5f5)",
    danger: "var(--danger, #d44)",
  };
  const colorMap = {
    primary: "#fff",
    secondary: "var(--text, #333)",
    danger: "#fff",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: 6,
        border: variant === "secondary" ? "1px solid var(--border, #ddd)" : "none",
        background: disabled ? "var(--muted-bg, #ccc)" : bgMap[variant],
        color: disabled ? "var(--text-muted, #888)" : colorMap[variant],
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: "0.9rem",
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}

function LogTable({ logs }: { logs: SyncLog[] }) {
  return (
    <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border, #ddd)" }}>
            <th style={{ textAlign: "left", padding: "0.4rem" }}>日時</th>
            <th style={{ textAlign: "left", padding: "0.4rem" }}>アクション</th>
            <th style={{ textAlign: "left", padding: "0.4rem" }}>ステータス</th>
            <th style={{ textAlign: "left", padding: "0.4rem" }}>詳細</th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 20).map((log) => (
            <tr key={log.id} style={{ borderBottom: "1px solid var(--border, #eee)" }}>
              <td style={{ padding: "0.4rem" }}>
                {new Date(log.createdAt).toLocaleString("ja-JP")}
              </td>
              <td style={{ padding: "0.4rem" }}>{log.action}</td>
              <td style={{ padding: "0.4rem" }}>
                <span style={{ color: log.status === "success" ? "var(--success, #070)" : "var(--danger, #c00)" }}>
                  {log.status}
                </span>
              </td>
              <td style={{ padding: "0.4rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                {log.errorMessage || log.externalId || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
