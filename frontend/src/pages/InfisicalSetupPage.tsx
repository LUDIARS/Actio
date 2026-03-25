import { useState } from "react";
import { setupApi } from "../lib/api";

interface InfisicalSetupPageProps {
  onComplete: () => void;
}

type AuthMethod = "universal" | "token";
type Step = "welcome" | "config" | "test" | "done";

export function InfisicalSetupPage({ onComplete }: InfisicalSetupPageProps) {
  const [step, setStep] = useState<Step>("welcome");

  // フォーム状態
  const [siteUrl, setSiteUrl] = useState("https://app.infisical.com");
  const [projectId, setProjectId] = useState("");
  const [environment, setEnvironment] = useState("dev");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("universal");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState("");

  // UI 状態
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  const formData = {
    siteUrl: siteUrl.trim() || undefined,
    projectId: projectId.trim(),
    environment: environment.trim() || "dev",
    authMethod,
    clientId: authMethod === "universal" ? clientId.trim() : undefined,
    clientSecret: authMethod === "universal" ? clientSecret.trim() : undefined,
    token: authMethod === "token" ? token.trim() : undefined,
  };

  const isFormValid = () => {
    if (!projectId.trim()) return false;
    if (authMethod === "universal") {
      return !!(clientId.trim() && clientSecret.trim());
    }
    return !!token.trim();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await setupApi.testConnection(formData);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "接続テストに失敗しました",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setupApi.saveInfisical(formData);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    setError(null);
    try {
      await setupApi.skip();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "スキップに失敗しました");
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: "1rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 560,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "2rem",
      }}>
        {/* ヘッダー */}
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Schedula
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Initial Setup
          </p>
        </div>

        {/* ステップインジケータ */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "0.5rem",
          marginBottom: "2rem",
        }}>
          {(["welcome", "config", "test", "done"] as Step[]).map((s, i) => (
            <div key={s} style={{
              width: 32,
              height: 4,
              borderRadius: 2,
              background: (["welcome", "config", "test", "done"] as Step[]).indexOf(step) >= i
                ? "var(--accent, #3b82f6)"
                : "var(--border, #e2e8f0)",
              transition: "background 0.2s",
            }} />
          ))}
        </div>

        {error && (
          <div style={{
            padding: "0.75rem 1rem",
            background: "var(--bg-error, #fef2f2)",
            color: "var(--text-error, #dc2626)",
            borderRadius: 8,
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}>
            {error}
          </div>
        )}

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
              Infisical セットアップ
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
              Schedula はシークレット管理に <strong>Infisical</strong> を使用できます。
              Infisical を設定すると、環境変数やAPIキーを安全に一元管理できます。
            </p>
            <div style={{
              padding: "1rem",
              background: "var(--bg-card, #f8fafc)",
              borderRadius: 8,
              border: "1px solid var(--border, #e2e8f0)",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
              lineHeight: 1.6,
            }}>
              <strong>Infisical とは？</strong>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                <li>オープンソースのシークレット管理プラットフォーム</li>
                <li>APIキー、DB接続情報、環境変数を暗号化して管理</li>
                <li>チームでのシークレット共有が安全に行える</li>
              </ul>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setStep("config")}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                Infisical を設定する
              </button>
              <button
                onClick={handleSkip}
                disabled={skipping}
                style={{
                  flex: 1,
                  padding: "0.7rem",
                  background: "var(--bg-surface-2, #f1f5f9)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                {skipping ? "スキップ中..." : "スキップ (後で設定)"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Config */}
        {step === "config" && (
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
              Infisical 接続設定
            </h2>

            <div className="form-group">
              <label>Infisical URL</label>
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://app.infisical.com"
              />
              <small style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                セルフホストの場合のみ変更
              </small>
            </div>

            <div className="form-group">
              <label>プロジェクト ID <span style={{ color: "var(--red, #ef4444)" }}>*</span></label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="your-project-id"
                style={{ fontFamily: "monospace" }}
              />
              <small style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                Infisical ダッシュボード &rarr; Settings &rarr; General
              </small>
            </div>

            <div className="form-group">
              <label>環境</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                style={{ width: "100%", padding: "0.5rem" }}
              >
                <option value="dev">dev (開発)</option>
                <option value="staging">staging (ステージング)</option>
                <option value="prod">prod (本番)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>認証方式</label>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setAuthMethod("universal")}
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    background: authMethod === "universal"
                      ? "var(--accent, #3b82f6)"
                      : "var(--bg-surface-2, #f1f5f9)",
                    color: authMethod === "universal" ? "#fff" : "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  Universal Auth (推奨)
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod("token")}
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    background: authMethod === "token"
                      ? "var(--accent, #3b82f6)"
                      : "var(--bg-surface-2, #f1f5f9)",
                    color: authMethod === "token" ? "#fff" : "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  Service Token
                </button>
              </div>

              {authMethod === "universal" ? (
                <>
                  <div className="form-group">
                    <label>クライアント ID <span style={{ color: "var(--red, #ef4444)" }}>*</span></label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Machine Identity の Client ID"
                      style={{ fontFamily: "monospace" }}
                    />
                  </div>
                  <div className="form-group">
                    <label>クライアントシークレット <span style={{ color: "var(--red, #ef4444)" }}>*</span></label>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Machine Identity の Client Secret"
                    />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label>Service Token <span style={{ color: "var(--red, #ef4444)" }}>*</span></label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="st.xxxxx..."
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                onClick={() => { setStep("welcome"); setError(null); }}
                style={{
                  padding: "0.7rem 1.5rem",
                  background: "var(--bg-surface-2, #f1f5f9)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                戻る
              </button>
              <button
                onClick={() => { setStep("test"); setTestResult(null); setError(null); }}
                disabled={!isFormValid()}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                接続テストへ
              </button>
            </div>
          </div>
        )}

        {/* Step: Test */}
        {step === "test" && (
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
              接続テスト
            </h2>

            <div style={{
              padding: "1rem",
              background: "var(--bg-card, #f8fafc)",
              borderRadius: 8,
              border: "1px solid var(--border, #e2e8f0)",
              marginBottom: "1rem",
              fontSize: "0.9rem",
            }}>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <div><strong>URL:</strong> {siteUrl || "https://app.infisical.com"}</div>
                <div><strong>Project ID:</strong> <code>{projectId}</code></div>
                <div><strong>環境:</strong> {environment}</div>
                <div><strong>認証:</strong> {authMethod === "universal" ? "Universal Auth" : "Service Token"}</div>
              </div>
            </div>

            {testResult && (
              <div style={{
                padding: "0.75rem 1rem",
                background: testResult.success
                  ? "var(--bg-success, #f0fdf4)"
                  : "var(--bg-error, #fef2f2)",
                color: testResult.success
                  ? "var(--text-success, #16a34a)"
                  : "var(--text-error, #dc2626)",
                borderRadius: 8,
                marginBottom: "1rem",
                fontSize: "0.9rem",
              }}>
                {testResult.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                style={{
                  flex: 1,
                  padding: "0.7rem",
                  background: "var(--bg-surface-2, #f1f5f9)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: testing ? "not-allowed" : "pointer",
                  color: "var(--text)",
                }}
              >
                {testing ? "テスト中..." : "接続テスト実行"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => { setStep("config"); setTestResult(null); setError(null); }}
                style={{
                  padding: "0.7rem 1.5rem",
                  background: "var(--bg-surface-2, #f1f5f9)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                戻る
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                {saving ? "保存中..." : "設定を保存して完了"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--bg-success, #f0fdf4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              fontSize: "2rem",
            }}>
              <span role="img" aria-label="check">&#10003;</span>
            </div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
              セットアップ完了
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              Infisical の設定が完了しました。<br />
              シークレットの管理は管理者メニューの「シークレット管理」から行えます。
            </p>
            <button
              onClick={onComplete}
              className="primary"
              style={{ padding: "0.7rem 2rem" }}
            >
              アプリを開始
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
