import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login, register, googleAuthUrl } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || "認証に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: 400,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Schedula
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Academic Scheduling System
          </p>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1.5rem",
          }}
        >
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                padding: "0.5rem",
                background: "transparent",
                border: "none",
                borderBottom: mode === m ? "2px solid var(--accent)" : "2px solid transparent",
                color: mode === m ? "var(--text)" : "var(--text-muted)",
                fontWeight: mode === m ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {m === "login" ? "ログイン" : "新規登録"}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              background: "rgba(248, 81, 73, 0.1)",
              border: "1px solid var(--red)",
              borderRadius: "var(--radius-sm)",
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              color: "var(--red)",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div className="form-group">
              <label>名前</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8文字以上"
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            className="primary"
            disabled={loading}
            style={{ width: "100%", marginTop: "0.5rem", padding: "0.6rem" }}
          >
            {loading
              ? "処理中..."
              : mode === "login"
                ? "ログイン"
                : "アカウント作成"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            margin: "1.25rem 0",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span>または</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <a
          href={googleAuthUrl}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            width: "100%",
            padding: "0.6rem",
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text)",
            fontSize: "0.875rem",
            textDecoration: "none",
            fontWeight: 500,
            transition: "background 0.15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Googleアカウントで続ける
        </a>
      </div>
    </div>
  );
}
