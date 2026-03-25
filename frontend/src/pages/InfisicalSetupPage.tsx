import { useState } from "react";
import { setupApi } from "../lib/api";

interface InfisicalSetupPageProps {
  onComplete: () => void;
}

type AuthMethod = "universal" | "token";
type ProviderChoice = "infisical" | "ssm";
type Step = "welcome" | "provider" | "config" | "test" | "secrets" | "done";

// アプリが使用する環境変数の定義
interface EnvVarDef {
  key: string;
  label: string;
  hint: string;
  required: boolean;
  type: "text" | "password" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  group: "db" | "auth" | "google" | "server";
}

const APP_ENV_VARS: EnvVarDef[] = [
  // データベース
  {
    key: "DB_DIALECT",
    label: "データベース種別",
    hint: "使用するデータベースエンジン",
    required: true,
    type: "select",
    options: [
      { value: "postgres", label: "PostgreSQL (推奨)" },
      { value: "sqlite", label: "SQLite" },
      { value: "mysql", label: "MySQL" },
    ],
    defaultValue: "postgres",
    group: "db",
  },
  {
    key: "DATABASE_URL",
    label: "DATABASE_URL",
    hint: "PostgreSQL/MySQL の接続文字列。例: postgresql://user:pass@host:5432/schedula",
    required: false,
    type: "text",
    placeholder: "postgresql://schedula:schedula@db:5432/schedula",
    group: "db",
  },
  {
    key: "DATABASE_PATH",
    label: "DATABASE_PATH",
    hint: "SQLite 使用時のファイルパス (DB_DIALECT=sqlite の場合のみ)",
    required: false,
    type: "text",
    placeholder: "data/schedula.db",
    group: "db",
  },
  // 認証
  {
    key: "JWT_SECRET",
    label: "JWT_SECRET",
    hint: "JWT トークン署名用のシークレット。本番環境では必須。",
    required: true,
    type: "password",
    placeholder: "ランダムな文字列を入力",
    group: "auth",
  },
  // サーバー
  {
    key: "FRONTEND_URL",
    label: "FRONTEND_URL",
    hint: "フロントエンドの公開URL。OAuth コールバック等に使用。",
    required: false,
    type: "text",
    placeholder: "https://schedula.example.com",
    group: "server",
  },
  {
    key: "PORT",
    label: "PORT",
    hint: "バックエンドサーバーのポート番号",
    required: false,
    type: "text",
    placeholder: "3000",
    defaultValue: "3000",
    group: "server",
  },
  {
    key: "NODE_ENV",
    label: "NODE_ENV",
    hint: "実行環境",
    required: false,
    type: "select",
    options: [
      { value: "production", label: "production" },
      { value: "development", label: "development" },
    ],
    defaultValue: "production",
    group: "server",
  },
  {
    key: "CORS_ORIGIN",
    label: "CORS_ORIGIN",
    hint: "CORS 許可オリジン (未設定時は FRONTEND_URL を使用)",
    required: false,
    type: "text",
    placeholder: "https://schedula.example.com",
    group: "server",
  },
  // Google OAuth
  {
    key: "GOOGLE_CLIENT_ID",
    label: "GOOGLE_CLIENT_ID",
    hint: "Google OAuth クライアントID (Google 認証を使う場合)",
    required: false,
    type: "text",
    placeholder: "xxxx.apps.googleusercontent.com",
    group: "google",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    label: "GOOGLE_CLIENT_SECRET",
    hint: "Google OAuth クライアントシークレット",
    required: false,
    type: "password",
    placeholder: "",
    group: "google",
  },
  {
    key: "GOOGLE_REDIRECT_URI",
    label: "GOOGLE_REDIRECT_URI",
    hint: "Google OAuth コールバックURL",
    required: false,
    type: "text",
    placeholder: "https://schedula.example.com/api/auth/google/callback",
    group: "google",
  },
  // Redis
  {
    key: "REDIS_URL",
    label: "REDIS_URL",
    hint: "Redis 接続URL (セッション永続化に使用。未設定ならDBフォールバック)",
    required: false,
    type: "text",
    placeholder: "redis://localhost:6379",
    group: "server",
  },
];

const GROUP_LABELS: Record<string, string> = {
  db: "データベース",
  auth: "認証",
  server: "サーバー設定",
  google: "Google OAuth (任意)",
};

const GROUP_ORDER = ["db", "auth", "server", "google"];

// ────────────────────────────────────────────────────────────

export function InfisicalSetupPage({ onComplete }: InfisicalSetupPageProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("ssm");

  // Infisical フォーム状態
  const [siteUrl, setSiteUrl] = useState("https://app.infisical.com");
  const [projectId, setProjectId] = useState("");
  const [environment, setEnvironment] = useState("dev");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("universal");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState("");

  // SSM フォーム状態
  const [ssmRegion, setSsmRegion] = useState("ap-northeast-1");
  const [ssmPathPrefix, setSsmPathPrefix] = useState("/schedula/prod/");

  // アプリ環境変数 (SSM に登録する値)
  const [appSecrets, setAppSecrets] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const v of APP_ENV_VARS) {
      defaults[v.key] = v.defaultValue ?? "";
    }
    return defaults;
  });

  // UI 状態
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  const infisicalFormData = {
    siteUrl: siteUrl.trim() || undefined,
    projectId: projectId.trim(),
    environment: environment.trim() || "dev",
    authMethod,
    clientId: authMethod === "universal" ? clientId.trim() : undefined,
    clientSecret: authMethod === "universal" ? clientSecret.trim() : undefined,
    token: authMethod === "token" ? token.trim() : undefined,
  };

  const ssmFormData = {
    region: ssmRegion.trim(),
    pathPrefix: ssmPathPrefix.trim(),
  };

  const isFormValid = () => {
    if (providerChoice === "infisical") {
      if (!projectId.trim()) return false;
      if (authMethod === "universal") {
        return !!(clientId.trim() && clientSecret.trim());
      }
      return !!token.trim();
    }
    // SSM
    return !!(ssmPathPrefix.trim() && ssmRegion.trim());
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      if (providerChoice === "infisical") {
        const result = await setupApi.testConnection(infisicalFormData);
        setTestResult(result);
      } else {
        const result = await setupApi.testSsm(ssmFormData);
        setTestResult(result);
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "接続テストに失敗しました",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveProvider = async () => {
    setSaving(true);
    setError(null);
    try {
      if (providerChoice === "infisical") {
        await setupApi.saveInfisical(infisicalFormData);
        setStep("done");
      } else {
        await setupApi.saveSsm(ssmFormData);
        // SSM の場合は環境変数登録ステップへ
        setStep("secrets");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecrets = async () => {
    setSavingSecrets(true);
    setError(null);
    try {
      // 空でない値のみ送信
      const nonEmpty: Record<string, string> = {};
      for (const [key, value] of Object.entries(appSecrets)) {
        if (value.trim()) {
          nonEmpty[key] = value.trim();
        }
      }

      if (Object.keys(nonEmpty).length > 0) {
        const result = await setupApi.saveSsmSecrets({
          region: ssmRegion.trim(),
          pathPrefix: ssmPathPrefix.trim(),
          secrets: nonEmpty,
        });

        if (!result.success) {
          setError(result.message);
          return;
        }
      }

      // SecretManager を再初期化 (新しいシークレットを読み込み)
      await setupApi.saveSsm(ssmFormData);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "シークレットの登録に失敗しました");
    } finally {
      setSavingSecrets(false);
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

  const updateAppSecret = (key: string, value: string) => {
    setAppSecrets((prev) => ({ ...prev, [key]: value }));
  };

  const currentStepList: Step[] = providerChoice === "ssm"
    ? ["welcome", "provider", "config", "test", "secrets", "done"]
    : ["welcome", "provider", "config", "test", "done"];

  const cardStyle = {
    padding: "0.75rem 1rem",
    background: "var(--bg-card, #f8fafc)",
    borderRadius: 8,
    border: "1px solid var(--border, #e2e8f0)",
    marginBottom: "1rem",
    fontSize: "0.85rem",
    lineHeight: 1.6,
  };

  const backBtnStyle = {
    padding: "0.7rem 1.5rem",
    background: "var(--bg-surface-2, #f1f5f9)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    color: "var(--text-muted)",
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
        maxWidth: step === "secrets" ? 700 : 560,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "2rem",
        transition: "max-width 0.3s",
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
          {currentStepList.map((s, i) => (
            <div key={s} style={{
              width: 32,
              height: 4,
              borderRadius: 2,
              background: currentStepList.indexOf(step) >= i
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
              シークレット管理セットアップ
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
              Schedula は外部のシークレット管理サービスと連携して、環境変数やAPIキーを安全に一元管理できます。
            </p>
            <div style={{ ...cardStyle, fontSize: "0.9rem" }}>
              <strong>対応プロバイダー</strong>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                <li><strong>AWS SSM Parameter Store</strong> — AWS のマネージドサービス。IAM ロールで認証。</li>
                <li><strong>Infisical</strong> — オープンソースのシークレット管理プラットフォーム</li>
              </ul>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setStep("provider")}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                プロバイダーを選択
              </button>
              <button
                onClick={handleSkip}
                disabled={skipping}
                style={{
                  ...backBtnStyle,
                  flex: 1,
                  padding: "0.7rem",
                }}
              >
                {skipping ? "スキップ中..." : "スキップ (後で設定)"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Provider Selection */}
        {step === "provider" && (
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
              プロバイダー選択
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <button
                type="button"
                onClick={() => setProviderChoice("ssm")}
                style={{
                  padding: "1rem",
                  background: providerChoice === "ssm"
                    ? "var(--accent-bg, #eff6ff)"
                    : "var(--bg-surface-2, #f1f5f9)",
                  border: providerChoice === "ssm"
                    ? "2px solid var(--accent, #3b82f6)"
                    : "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                  AWS SSM Parameter Store
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  AWS マネージドサービス。EC2/ECS/Lambda では IAM ロールで自動認証。軽量で高速。
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProviderChoice("infisical")}
                style={{
                  padding: "1rem",
                  background: providerChoice === "infisical"
                    ? "var(--accent-bg, #eff6ff)"
                    : "var(--bg-surface-2, #f1f5f9)",
                  border: providerChoice === "infisical"
                    ? "2px solid var(--accent, #3b82f6)"
                    : "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                  Infisical
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  オープンソースのシークレット管理。セルフホスト可能。GUI でシークレットの編集が可能。
                </div>
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => { setStep("welcome"); setError(null); }}
                style={backBtnStyle}
              >
                戻る
              </button>
              <button
                onClick={() => { setStep("config"); setError(null); }}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* Step: Config (SSM) */}
        {step === "config" && providerChoice === "ssm" && (
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
              SSM Parameter Store 接続設定
            </h2>

            <div className="form-group">
              <label>AWS リージョン <span style={{ color: "var(--red, #ef4444)" }}>*</span></label>
              <select
                value={ssmRegion}
                onChange={(e) => setSsmRegion(e.target.value)}
                style={{ width: "100%", padding: "0.5rem" }}
              >
                <option value="ap-northeast-1">ap-northeast-1 (東京)</option>
                <option value="ap-northeast-3">ap-northeast-3 (大阪)</option>
                <option value="ap-southeast-1">ap-southeast-1 (シンガポール)</option>
                <option value="us-east-1">us-east-1 (バージニア)</option>
                <option value="us-west-2">us-west-2 (オレゴン)</option>
                <option value="eu-west-1">eu-west-1 (アイルランド)</option>
                <option value="eu-central-1">eu-central-1 (フランクフルト)</option>
              </select>
            </div>

            <div className="form-group">
              <label>パスプレフィックス <span style={{ color: "var(--red, #ef4444)" }}>*</span></label>
              <input
                type="text"
                value={ssmPathPrefix}
                onChange={(e) => setSsmPathPrefix(e.target.value)}
                placeholder="/schedula/prod/"
                style={{ fontFamily: "monospace" }}
              />
              <small style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                SSM パラメータのパスプレフィックス。例: /schedula/prod/
              </small>
            </div>

            <div style={cardStyle}>
              <strong>認証方法</strong>
              <p style={{ margin: "0.25rem 0 0" }}>
                AWS の認証情報は環境変数 (<code>AWS_ACCESS_KEY_ID</code> / <code>AWS_SECRET_ACCESS_KEY</code>)
                または IAM ロール (EC2/ECS/Lambda) で自動的に使用されます。
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                onClick={() => { setStep("provider"); setError(null); }}
                style={backBtnStyle}
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

        {/* Step: Config (Infisical) */}
        {step === "config" && providerChoice === "infisical" && (
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
                onClick={() => { setStep("provider"); setError(null); }}
                style={backBtnStyle}
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

            <div style={{ ...cardStyle, fontSize: "0.9rem" }}>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <div><strong>プロバイダー:</strong> {providerChoice === "ssm" ? "SSM Parameter Store" : "Infisical"}</div>
                {providerChoice === "ssm" ? (
                  <>
                    <div><strong>リージョン:</strong> {ssmRegion}</div>
                    <div><strong>パスプレフィックス:</strong> <code>{ssmPathPrefix}</code></div>
                  </>
                ) : (
                  <>
                    <div><strong>URL:</strong> {siteUrl || "https://app.infisical.com"}</div>
                    <div><strong>Project ID:</strong> <code>{projectId}</code></div>
                    <div><strong>環境:</strong> {environment}</div>
                    <div><strong>認証:</strong> {authMethod === "universal" ? "Universal Auth" : "Service Token"}</div>
                  </>
                )}
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
                  ...backBtnStyle,
                  flex: 1,
                  padding: "0.7rem",
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
                style={backBtnStyle}
              >
                戻る
              </button>
              <button
                onClick={handleSaveProvider}
                disabled={saving}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                {saving
                  ? "保存中..."
                  : providerChoice === "ssm"
                    ? "保存して環境変数設定へ"
                    : "設定を保存して完了"
                }
              </button>
            </div>
          </div>
        )}

        {/* Step: Secrets (SSM のみ — アプリ環境変数を SSM に登録) */}
        {step === "secrets" && providerChoice === "ssm" && (
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
              環境変数の登録
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
              アプリが使用する環境変数を SSM Parameter Store (<code>{ssmPathPrefix}</code>) に登録します。
              空欄の項目はスキップされます。後から AWS コンソールや CLI でも追加・変更できます。
            </p>

            {GROUP_ORDER.map((group) => {
              const vars = APP_ENV_VARS.filter((v) => v.group === group);
              if (vars.length === 0) return null;

              return (
                <div key={group} style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{
                    fontSize: "0.95rem",
                    marginBottom: "0.75rem",
                    paddingBottom: "0.35rem",
                    borderBottom: "1px solid var(--border, #e2e8f0)",
                    color: "var(--text)",
                  }}>
                    {GROUP_LABELS[group]}
                  </h3>

                  {vars.map((v) => (
                    <div key={v.key} className="form-group" style={{ marginBottom: "0.75rem" }}>
                      <label style={{ fontSize: "0.85rem" }}>
                        <code style={{ fontWeight: 600 }}>{v.key}</code>
                        {v.required && <span style={{ color: "var(--red, #ef4444)", marginLeft: 4 }}>*</span>}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                          {v.label !== v.key ? v.label : ""}
                        </span>
                      </label>
                      {v.type === "select" ? (
                        <select
                          value={appSecrets[v.key] || ""}
                          onChange={(e) => updateAppSecret(v.key, e.target.value)}
                          style={{ width: "100%", padding: "0.5rem" }}
                        >
                          <option value="">-- 選択 --</option>
                          {v.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={v.type}
                          value={appSecrets[v.key] || ""}
                          onChange={(e) => updateAppSecret(v.key, e.target.value)}
                          placeholder={v.placeholder}
                          style={{ fontFamily: v.type === "text" ? "monospace" : undefined }}
                        />
                      )}
                      <small style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {v.hint}
                      </small>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                onClick={() => { setStep("test"); setError(null); }}
                style={backBtnStyle}
              >
                戻る
              </button>
              <button
                onClick={() => { setStep("done"); }}
                style={{
                  ...backBtnStyle,
                  padding: "0.7rem 1rem",
                  color: "var(--text-muted)",
                }}
              >
                スキップ
              </button>
              <button
                onClick={handleSaveSecrets}
                disabled={savingSecrets}
                className="primary"
                style={{ flex: 1, padding: "0.7rem" }}
              >
                {savingSecrets ? "登録中..." : "SSM に登録して完了"}
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
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
              {providerChoice === "ssm"
                ? "SSM Parameter Store の設定が完了しました。"
                : "Infisical の設定が完了しました。"}
              <br />
              シークレットの管理は管理者メニューの「シークレット管理」から行えます。
            </p>

            {providerChoice === "ssm" && (
              <div style={{
                textAlign: "left",
                padding: "1rem",
                background: "var(--bg-card, #f8fafc)",
                borderRadius: 8,
                border: "1px solid var(--border, #e2e8f0)",
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
                lineHeight: 1.6,
              }}>
                <strong>.env に必要な最小構成 (ブートストラップ用):</strong>
                <pre style={{
                  background: "var(--bg-code, #1e293b)",
                  color: "var(--text-code, #e2e8f0)",
                  padding: "0.75rem",
                  borderRadius: 6,
                  marginTop: "0.5rem",
                  fontSize: "0.8rem",
                  overflowX: "auto",
                }}>
{`SECRETS_PROVIDER=ssm
SSM_PATH_PREFIX=${ssmPathPrefix}
AWS_REGION=${ssmRegion}`}
                </pre>
                <p style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
                  EC2 で IAM ロールを使用する場合、これだけで動作します。
                  その他の環境変数は全て SSM から自動取得されます。
                </p>
              </div>
            )}

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
