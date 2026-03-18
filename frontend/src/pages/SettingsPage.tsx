import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { settingsApi } from "../lib/api";
import { API_BASE } from "../lib/constants";

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: "number" | "text";
  min?: number;
  max?: number;
  unit?: string;
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: "app.name",
    label: "アプリ名",
    description: "サイドバーやタイトルに表示される名前",
    type: "text",
  },
  {
    key: "session.refreshTokenDays",
    label: "ログインセッション有効期間",
    description: "リフレッシュトークンの有効期間。長くするとログイン状態を長期間維持可能",
    type: "number",
    min: 1,
    max: 365,
    unit: "日",
  },
  {
    key: "session.accessTokenMinutes",
    label: "アクセストークン有効期間",
    description: "アクセストークンの有効期間。自動更新されるため短めで問題なし",
    type: "number",
    min: 5,
    max: 1440,
    unit: "分",
  },
];

export function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const isAdmin = user?.role === "admin";

  const fetchSettings = useCallback(async () => {
    try {
      setError(null);
      const data = await settingsApi.getSettings();
      setSettings(data.settings);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await settingsApi.updateSettings(settings);
      setSettings(data.settings);
      setDirty(false);
      setSuccess("設定を保存しました");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/api/settings/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schedula-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`エクスポート失敗: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>設定</h1>
        <div style={styles.card}>
          <p style={{ color: "var(--text-muted)" }}>管理者権限が必要です</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>設定</h1>
        <p style={{ color: "var(--text-muted)" }}>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "720px" }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>設定</h1>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        アプリケーションの動作設定を管理します
      </p>

      {error && (
        <div style={styles.alert}>
          {error}
        </div>
      )}
      {success && (
        <div style={styles.alertSuccess}>
          {success}
        </div>
      )}

      {/* 設定フォーム */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>一般設定</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {SETTING_FIELDS.map((field) => (
            <div key={field.key}>
              <label style={styles.label}>
                {field.label}
                {field.unit && (
                  <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "0.25rem" }}>
                    ({field.unit})
                  </span>
                )}
              </label>
              <p style={styles.description}>{field.description}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type={field.type}
                  value={settings[field.key] ?? ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  min={field.min}
                  max={field.max}
                  style={styles.input}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{
              ...styles.btnPrimary,
              opacity: saving || !dirty ? 0.5 : 1,
              cursor: saving || !dirty ? "default" : "pointer",
            }}
          >
            {saving ? "保存中..." : "設定を保存"}
          </button>
          {dirty && (
            <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>未保存の変更があります</span>
          )}
        </div>
      </div>

      {/* DBエクスポート */}
      <div style={{ ...styles.card, marginTop: "1.5rem" }}>
        <h2 style={styles.sectionTitle}>データ管理</h2>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          データベースの全テーブルをJSON形式でエクスポートします。バックアップや移行に利用できます。
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            ...styles.btnSecondary,
            opacity: exporting ? 0.5 : 1,
            cursor: exporting ? "default" : "pointer",
          }}
        >
          {exporting ? "エクスポート中..." : "DBデータを一括エクスポート"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "1.5rem",
  },
  sectionTitle: {
    fontSize: "0.95rem",
    fontWeight: 600,
    marginBottom: "1rem",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid var(--border)",
  },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    marginBottom: "0.15rem",
  },
  description: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    marginBottom: "0.5rem",
    marginTop: 0,
  },
  input: {
    width: "100%",
    maxWidth: "300px",
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
    background: "var(--bg-surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text)",
    outline: "none",
  },
  btnPrimary: {
    padding: "0.5rem 1.25rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    background: "var(--accent)",
    color: "#000",
    border: "none",
    borderRadius: "var(--radius-sm)",
  },
  btnSecondary: {
    padding: "0.5rem 1.25rem",
    fontSize: "0.85rem",
    background: "var(--bg-surface-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
  alert: {
    padding: "0.75rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.8rem",
    background: "rgba(255, 85, 85, 0.1)",
    border: "1px solid var(--red)",
    borderRadius: "var(--radius-sm)",
    color: "var(--red)",
  },
  alertSuccess: {
    padding: "0.75rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.8rem",
    background: "rgba(80, 250, 123, 0.1)",
    border: "1px solid var(--green)",
    borderRadius: "var(--radius-sm)",
    color: "var(--green)",
  },
};
