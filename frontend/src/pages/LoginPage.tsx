import { ThemeToggle } from "../components/ThemeToggle";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { loginErrorMessage } from "./login-error";

/**
 * ログインの入口は「パスキーで続ける」1 つ (neco 2026-10-15「Composite もパスキー一本化」)。
 *
 * Cernere のログインはパスキーのみで、パスキーの RP ID は Cernere の origin。認証は Cernere の
 * ログイン画面 (/composite/login) で行い、Actio は popup で開いて authCode を受け取るだけにする。
 * はじめての方のアカウント作成も Cernere の同じ入口で行う。
 * 旧モバイル用の埋め込みフォーム (email / password) は Cernere 側で廃止 (410) のため削除した。
 */
export function LoginPage() {
  const { loginWithPopup } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithPopup();
    } catch (err: unknown) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "min(400px, 100%)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Actio
          </h1>
          <ThemeToggle />
        </div>

        {error && (
          <div style={{
            background: "rgba(248, 81, 73, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
            color: "var(--red)",
          }}>
            {error}
          </div>
        )}

        <button
          onClick={() => { void handleLogin(); }}
          className="primary"
          disabled={loading}
          style={{ width: "100%", padding: "0.6rem" }}
        >
          {loading ? "処理中..." : "パスキーで続ける"}
        </button>

        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "1.5rem" }}>
          はじめての方も、このボタンから Cernere のアカウントを作れます
        </p>
      </div>
    </div>
  );
}
