import { useState } from "react";
import { CompositeLogin, type CompositeAuthApi } from "@ludiars/cernere-composite/ui";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { API_BASE } from "../lib/constants";

/**
 * モバイルでは <CompositeLogin> を同一ページ内に埋め込み (半SPA)、
 * デスクトップは従来のポップアップフローを継続する。
 *
 * CORS を避けるため、埋め込み時の認証通信は Schedula backend の
 * /api/auth/cernere/* プロキシ (→ project WS → Cernere) を経由する。
 */

// Schedula backend 経由で Cernere Composite の認証を呼ぶ authApi 実装
const authApi: CompositeAuthApi = {
  async login({ email, password }) {
    const res = await fetch(`${API_BASE}/api/auth/cernere/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Login failed");
    return data;
  },
  async register({ name, email, password }) {
    const res = await fetch(`${API_BASE}/api/auth/cernere/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Registration failed");
    return data;
  },
  async mfaVerify({ mfaToken, method, code }) {
    const res = await fetch(`${API_BASE}/api/auth/cernere/mfa-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mfaToken, method, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "MFA verification failed");
    return data;
  },
};

export function LoginPage() {
  const { loginWithPopup, completeLogin } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePopupLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithPopup();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      if (msg !== "Login popup was closed.") setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthCode = async (authCode: string) => {
    setError("");
    try {
      await completeLogin(authCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  // ─── モバイル: 埋め込み半SPA ────────────────────────
  if (isMobile) {
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
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: "1rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              Schedula
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Academic Scheduling System
            </p>
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
          <CompositeLogin authApi={authApi} onAuthCode={handleAuthCode} />
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "1rem" }}>
            Cernere 認証基盤を使用しています
          </p>
        </div>
      </div>
    );
  }

  // ─── デスクトップ: ポップアップフロー (既存) ─────────
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
          onClick={handlePopupLogin}
          className="primary"
          disabled={loading}
          style={{ width: "100%", padding: "0.6rem" }}
        >
          {loading ? "処理中..." : "Cernere でログイン"}
        </button>

        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "1.5rem" }}>
          Cernere 認証基盤を使用しています
        </p>
      </div>
    </div>
  );
}
