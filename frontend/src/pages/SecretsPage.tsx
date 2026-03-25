import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { secretsApi } from "../lib/api";

interface SecretKey {
  key: string;
  scope: "shared" | "personal";
  hasValue: boolean;
}

export function SecretsPage() {
  const { user } = useAuth();
  const [infisicalEnabled, setInfisicalEnabled] = useState(false);
  const [keys, setKeys] = useState<SecretKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 新規シークレット追加フォーム
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newScope, setNewScope] = useState<"shared" | "personal">("shared");
  const [adding, setAdding] = useState(false);

  // 編集中
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await secretsApi.getStatus();
      setInfisicalEnabled(status.infisicalEnabled);

      if (status.infisicalEnabled) {
        const keysRes = await secretsApi.listKeys();
        setKeys(keysRes.keys);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (user?.role !== "admin") {
    return <div style={{ padding: "2rem" }}>管理者権限が必要です</div>;
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await secretsApi.refresh();
      setSuccess(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "リフレッシュに失敗しました");
    } finally {
      setRefreshing(false);
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue) {
      setError("キーと値を入力してください");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await secretsApi.setSecret(newKey.trim(), newValue, newScope);
      setSuccess(`シークレット "${newKey.trim()}" を保存しました`);
      setNewKey("");
      setNewValue("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (key: string) => {
    if (!editValue) {
      setError("値を入力してください");
      return;
    }
    setError(null);
    const target = keys.find((k) => k.key === key);
    try {
      await secretsApi.setSecret(key, editValue, target?.scope || "shared");
      setSuccess(`シークレット "${key}" を更新しました`);
      setEditingKey(null);
      setEditValue("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    }
  };

  const handleDelete = async (key: string, scope: "shared" | "personal") => {
    if (!confirm(`シークレット "${key}" を削除しますか？`)) return;
    setError(null);
    try {
      await secretsApi.deleteSecret(key, scope);
      setSuccess(`シークレット "${key}" を削除しました`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const sharedKeys = keys.filter((k) => k.scope === "shared");
  const personalKeys = keys.filter((k) => k.scope === "personal");

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900 }}>
      <h2 style={{ marginBottom: "0.5rem" }}>シークレット管理</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        Infisical を使ったシークレット・環境変数の一元管理
      </p>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          background: "var(--bg-error, #fef2f2)",
          color: "var(--text-error, #dc2626)",
          borderRadius: 8,
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: "0.75rem 1rem",
          background: "var(--bg-success, #f0fdf4)",
          color: "var(--text-success, #16a34a)",
          borderRadius: 8,
          marginBottom: "1rem",
        }}>
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{ marginLeft: "1rem", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", color: "inherit" }}
          >
            閉じる
          </button>
        </div>
      )}

      {loading ? (
        <p>読み込み中...</p>
      ) : !infisicalEnabled ? (
        <div style={{
          padding: "2rem",
          background: "var(--bg-card, #f8fafc)",
          borderRadius: 12,
          border: "1px solid var(--border, #e2e8f0)",
          textAlign: "center",
        }}>
          <h3 style={{ marginBottom: "1rem" }}>Infisical 未設定</h3>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
            現在は環境変数フォールバックモードで動作しています。
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Infisical を有効にするには、以下の環境変数を設定してサーバーを再起動してください:
          </p>
          <pre style={{
            textAlign: "left",
            background: "var(--bg-code, #1e293b)",
            color: "var(--text-code, #e2e8f0)",
            padding: "1rem",
            borderRadius: 8,
            marginTop: "1rem",
            fontSize: "0.85rem",
            overflowX: "auto",
          }}>
{`INFISICAL_PROJECT_ID=<your-project-id>
INFISICAL_ENVIRONMENT=dev

# Universal Auth (推奨)
INFISICAL_CLIENT_ID=<client-id>
INFISICAL_CLIENT_SECRET=<client-secret>

# または Service Token
INFISICAL_TOKEN=<service-token>

# オプション
INFISICAL_SITE_URL=https://app.infisical.com`}
          </pre>
        </div>
      ) : (
        <>
          {/* ツールバー */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: "0.5rem 1rem" }}
            >
              {refreshing ? "リフレッシュ中..." : "Infisical からリフレッシュ"}
            </button>
            <span style={{ color: "var(--text-muted)", alignSelf: "center", fontSize: "0.85rem" }}>
              {keys.length} 件のシークレット
            </span>
          </div>

          {/* プロジェクトグローバル */}
          <section style={{ marginBottom: "2rem" }}>
            <h3 style={{ marginBottom: "0.75rem", borderBottom: "2px solid var(--border, #e2e8f0)", paddingBottom: "0.5rem" }}>
              プロジェクトグローバル (shared)
            </h3>
            {sharedKeys.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>シークレットがありません</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem" }}>キー</th>
                    <th style={{ textAlign: "center", padding: "0.5rem", width: 80 }}>状態</th>
                    <th style={{ textAlign: "right", padding: "0.5rem", width: 200 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedKeys.map((k) => (
                    <tr key={k.key} style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                      <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.9rem" }}>{k.key}</td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: k.hasValue ? "#22c55e" : "#ef4444",
                        }} />
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {editingKey === k.key ? (
                          <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                            <input
                              type="password"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder="新しい値"
                              style={{ width: 140, padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            />
                            <button onClick={() => handleUpdate(k.key)} className="btn btn-primary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>保存</button>
                            <button onClick={() => setEditingKey(null)} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>取消</button>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                            <button
                              onClick={() => { setEditingKey(k.key); setEditValue(""); }}
                              className="btn btn-secondary"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(k.key, "shared")}
                              className="btn btn-danger"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                            >
                              削除
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 個人 (personal) */}
          <section style={{ marginBottom: "2rem" }}>
            <h3 style={{ marginBottom: "0.75rem", borderBottom: "2px solid var(--border, #e2e8f0)", paddingBottom: "0.5rem" }}>
              個人オーバーライド (personal)
            </h3>
            {personalKeys.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>個人オーバーライドはありません</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem" }}>キー</th>
                    <th style={{ textAlign: "center", padding: "0.5rem", width: 80 }}>状態</th>
                    <th style={{ textAlign: "right", padding: "0.5rem", width: 200 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {personalKeys.map((k) => (
                    <tr key={k.key} style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                      <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.9rem" }}>{k.key}</td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: k.hasValue ? "#22c55e" : "#ef4444",
                        }} />
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {editingKey === k.key ? (
                          <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                            <input
                              type="password"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder="新しい値"
                              style={{ width: 140, padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            />
                            <button onClick={() => handleUpdate(k.key)} className="btn btn-primary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>保存</button>
                            <button onClick={() => setEditingKey(null)} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>取消</button>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                            <button
                              onClick={() => { setEditingKey(k.key); setEditValue(""); }}
                              className="btn btn-secondary"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(k.key, "personal")}
                              className="btn btn-danger"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                            >
                              削除
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 新規追加フォーム */}
          <section>
            <h3 style={{ marginBottom: "0.75rem", borderBottom: "2px solid var(--border, #e2e8f0)", paddingBottom: "0.5rem" }}>
              シークレット追加
            </h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>キー</label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="SECRET_NAME"
                  style={{ padding: "0.5rem", width: 200, fontFamily: "monospace" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>値</label>
                <input
                  type="password"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="secret-value"
                  style={{ padding: "0.5rem", width: 200 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>スコープ</label>
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value as "shared" | "personal")}
                  style={{ padding: "0.5rem" }}
                >
                  <option value="shared">shared (グローバル)</option>
                  <option value="personal">personal (個人)</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="btn btn-primary"
                style={{ padding: "0.5rem 1rem" }}
              >
                {adding ? "保存中..." : "追加"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
