import { useState, useEffect, useCallback } from "react";
import { externalApiClient } from "../lib/api";
import type { ApiClientInfo } from "../lib/api-types";

const SCOPE_LABELS: Record<string, string> = {
  calendar: "カレンダー",
  reminders: "リマインダー",
  schedules: "予定設定",
};

const ALL_SCOPES = ["calendar", "reminders", "schedules"];

export function ApiKeysPage() {
  const [clients, setClients] = useState<ApiClientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>([...ALL_SCOPES]);
  const [creating, setCreating] = useState(false);

  // Secret display
  const [createdSecret, setCreatedSecret] = useState<{
    clientId: string;
    clientSecret: string;
    name: string;
  } | null>(null);

  // Docs
  const [showDocs, setShowDocs] = useState(false);
  const [docs, setDocs] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalApiClient.list();
      setClients(res.clients);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      setCreating(true);
      const res = await externalApiClient.create({ name: newName.trim(), scopes: newScopes });
      setCreatedSecret({
        clientId: res.client.clientId,
        clientSecret: res.client.clientSecret,
        name: res.client.name,
      });
      setNewName("");
      setNewScopes([...ALL_SCOPES]);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRegenerate = async (id: string) => {
    if (!confirm("キーを再発行しますか？既存のキーは無効になります。")) return;
    try {
      const res = await externalApiClient.regenerate(id);
      setCreatedSecret({
        clientId: res.client.clientId,
        clientSecret: res.client.clientSecret,
        name: res.client.name,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggle = async (client: ApiClientInfo) => {
    try {
      await externalApiClient.update(client.id, { isActive: !client.isActive });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このAPIクライアントを削除しますか？")) return;
    try {
      await externalApiClient.remove(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleShowDocs = async () => {
    if (!docs) {
      try {
        const res = await externalApiClient.getDocs();
        setDocs(res);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    setShowDocs(!showDocs);
  };

  const toggleScope = (scope: string) => {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>API連携</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={handleShowDocs}
            style={{
              padding: "0.4rem 0.8rem",
              fontSize: "0.8rem",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {showDocs ? "ドキュメントを閉じる" : "APIドキュメント"}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{
              padding: "0.4rem 0.8rem",
              fontSize: "0.8rem",
              background: "var(--accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#000",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + 新しいAPIキー
          </button>
        </div>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        外部アプリケーションからSchedulaのカレンダー・リマインダー・予定設定を操作するためのAPIキーを管理します。
      </p>

      {error && (
        <div style={{ padding: "0.5rem", background: "var(--red-bg, #2d1515)", borderRadius: "var(--radius-sm)", marginBottom: "1rem", fontSize: "0.8rem", color: "var(--red, #f44)" }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "0.5rem", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>x</button>
        </div>
      )}

      {/* Created secret display */}
      {createdSecret && (
        <div style={{
          padding: "1rem",
          background: "var(--bg-surface-2)",
          border: "2px solid var(--accent)",
          borderRadius: "var(--radius-sm)",
          marginBottom: "1rem",
        }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
            APIキーが発行されました: {createdSecret.name}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            シークレットは今回のみ表示されます。安全に保管してください。
          </div>
          <div style={{ marginBottom: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Client ID:</label>
            <code style={{ display: "block", padding: "0.3rem", background: "var(--bg-surface)", borderRadius: 3, fontSize: "0.75rem", wordBreak: "break-all" }}>
              {createdSecret.clientId}
            </code>
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Client Secret:</label>
            <code style={{ display: "block", padding: "0.3rem", background: "var(--bg-surface)", borderRadius: 3, fontSize: "0.75rem", wordBreak: "break-all" }}>
              {createdSecret.clientSecret}
            </code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `X-API-Client-ID: ${createdSecret.clientId}\nX-API-Client-Secret: ${createdSecret.clientSecret}`
              );
            }}
            style={{
              padding: "0.3rem 0.6rem",
              fontSize: "0.75rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text)",
              marginRight: "0.5rem",
            }}
          >
            コピー
          </button>
          <button
            onClick={() => setCreatedSecret(null)}
            style={{
              padding: "0.3rem 0.6rem",
              fontSize: "0.75rem",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            閉じる
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: "1rem", background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>新しいAPIクライアント</h3>
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>名前</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: My App"
              style={{
                display: "block",
                width: "100%",
                padding: "0.4rem",
                fontSize: "0.8rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>スコープ</label>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
              {ALL_SCOPES.map((scope) => (
                <label key={scope} style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={newScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  {SCOPE_LABELS[scope] || scope}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || newScopes.length === 0}
              style={{
                padding: "0.4rem 0.8rem",
                fontSize: "0.8rem",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#000",
                cursor: "pointer",
                fontWeight: 600,
                opacity: creating || !newName.trim() || newScopes.length === 0 ? 0.5 : 1,
              }}
            >
              {creating ? "作成中..." : "作成"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{
                padding: "0.4rem 0.8rem",
                fontSize: "0.8rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* API Docs */}
      {showDocs && docs && (
        <div style={{
          padding: "1rem",
          background: "var(--bg-surface-2)",
          borderRadius: "var(--radius-sm)",
          marginBottom: "1rem",
          maxHeight: "60vh",
          overflow: "auto",
        }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
            {(docs as Record<string, string>).title || "API Documentation"}
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            {(docs as Record<string, string>).description}
          </p>

          <h4 style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>認証</h4>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            すべての外部APIリクエストには以下のHTTPヘッダーが必要です:
          </p>
          <code style={{ display: "block", padding: "0.5rem", background: "var(--bg-surface)", borderRadius: 3, fontSize: "0.7rem", marginBottom: "0.75rem" }}>
            X-API-Client-ID: scl_...<br />
            X-API-Client-Secret: (your-secret)
          </code>

          <h4 style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>エンドポイント一覧</h4>
          {renderDocsModules(docs)}
        </div>
      )}

      {/* Client list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>読み込み中...</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          APIクライアントがありません。「+ 新しいAPIキー」から作成してください。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {clients.map((client) => (
            <div
              key={client.id}
              style={{
                padding: "0.75rem",
                background: "var(--bg-surface-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                opacity: client.isActive ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {client.name}
                  {!client.isActive && (
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>(無効)</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    onClick={() => handleToggle(client)}
                    style={{
                      padding: "0.2rem 0.5rem",
                      fontSize: "0.7rem",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                    }}
                  >
                    {client.isActive ? "無効化" : "有効化"}
                  </button>
                  <button
                    onClick={() => handleRegenerate(client.id)}
                    style={{
                      padding: "0.2rem 0.5rem",
                      fontSize: "0.7rem",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                    }}
                  >
                    再発行
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    style={{
                      padding: "0.2rem 0.5rem",
                      fontSize: "0.7rem",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      color: "var(--red, #f44)",
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                Client ID: <code style={{ fontSize: "0.7rem" }}>{client.clientId}</code>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                スコープ: {(client.scopes as string[]).map((s) => SCOPE_LABELS[s] || s).join(", ")}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                作成日: {new Date(client.createdAt).toLocaleDateString("ja-JP")}
                {client.lastUsedAt && ` | 最終使用: ${new Date(client.lastUsedAt).toLocaleDateString("ja-JP")}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DocsModule {
  description: string;
  basePath: string;
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
  }>;
}

function renderDocsModules(docs: Record<string, unknown>) {
  const modules = (docs as { modules?: Record<string, DocsModule> }).modules;
  if (!modules) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {Object.entries(modules).map(([key, mod]) => (
        <div key={key}>
          <h5 style={{ fontSize: "0.8rem", marginBottom: "0.2rem" }}>
            {SCOPE_LABELS[key] || key} — {mod.basePath}
          </h5>
          <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            {mod.description}
          </p>
          <table style={{ width: "100%", fontSize: "0.7rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.2rem 0.3rem" }}>Method</th>
                <th style={{ textAlign: "left", padding: "0.2rem 0.3rem" }}>Path</th>
                <th style={{ textAlign: "left", padding: "0.2rem 0.3rem" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {mod.endpoints?.map((ep, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.2rem 0.3rem" }}>
                    <code style={{
                      fontSize: "0.65rem",
                      padding: "0.1rem 0.3rem",
                      borderRadius: 3,
                      background: ep.method === "GET" ? "#2a4a2a" : ep.method === "POST" ? "#2a2a4a" : ep.method === "PUT" ? "#4a4a2a" : "#4a2a2a",
                      color: "#fff",
                    }}>
                      {ep.method}
                    </code>
                  </td>
                  <td style={{ padding: "0.2rem 0.3rem" }}>
                    <code style={{ fontSize: "0.65rem" }}>{ep.path}</code>
                  </td>
                  <td style={{ padding: "0.2rem 0.3rem", color: "var(--text-muted)" }}>{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
