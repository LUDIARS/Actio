import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { auth as authApi, getStoredUser, setStoredUser, clearTokens } from "../lib/api";
import { API_BASE } from "../lib/constants";
import { wsClient } from "../lib/ws-client";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  wsConnected: boolean;
  loginWithPopup: () => Promise<void>;
  /** 埋め込みログイン (モバイル向け): authCode を受け取ってセッション確立 */
  completeLogin: (authCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [wsConnected, setWsConnected] = useState(false);
  // 初期 loading は「保存済セッションあり」OR「URL に ?code= がある」(Cernere からの open_url 着地)
  // のとき true。loading=false で AppRoutes が描画されると RequireAuth が
  // /login へ Navigate replace してしまい、?code= が URL から消える。
  const [loading, setLoading] = useState(() => {
    if (getStoredUser()) return true;
    const params = new URLSearchParams(window.location.search);
    return params.has("code");
  });

  // WS 接続 — Cookie から短期トークンを取得してWS URLに埋め込む
  const connectWs = useCallback(async () => {
    if (wsClient.connected) return;

    try {
      const res = await fetch(`${API_BASE}/api/auth/ws-token`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to get WS token");
      const { token } = await res.json() as { token: string };
      await wsClient.connect(token);
      setWsConnected(true);
    } catch (err) {
      console.warn("[AuthContext] WS 接続失敗:", (err as Error).message);
      setWsConnected(false);
    }
  }, []);

  // ユーザー認証状態に応じて WS 接続/切断
  useEffect(() => {
    if (user) {
      connectWs();
    } else {
      wsClient.disconnect();
      setWsConnected(false);
    }
  }, [user, connectWs]);

  // WS 切断検知
  useEffect(() => {
    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === "error" && msg.code === "session_revoked") {
        console.warn("[AuthContext] セッション無効化 — ログアウト");
        clearTokens();
        setUser(null);
        setWsConnected(false);
      }
    });
    return unsubscribe;
  }, []);

  // 初期化: 保存済みトークン or URL ?code= (Cernere からの open_url リダイレクト) でセッション確立
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingCode = params.get("code");

    // Cernere の open_url 経由で来た場合は authCode 交換を最優先
    if (incomingCode) {
      const codeMask = `${incomingCode.slice(0, 8)}…(${incomingCode.length})`;
      console.log(`[AuthContext] incoming ?code= detected: ${codeMask}`);

      // URL から code を消す (履歴・他ブックマーク用)
      params.delete("code");
      const cleanQuery = params.toString();
      const cleanUrl = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "") + window.location.hash;
      window.history.replaceState({}, "", cleanUrl);

      completeLogin(incomingCode)
        .then(() => console.log(`[AuthContext] code exchange ok`))
        .catch((err) => {
          console.warn("[AuthContext] code 交換失敗:", (err as Error).message);
          // 失敗時は既存セッション (もしあれば) で再開を試みる
        })
        .finally(() => setLoading(false));
      return;
    }

    const stored = getStoredUser();
    if (!stored) {
      setLoading(false);
      return;
    }

    authApi.me()
      .then((me) => {
        const u = { id: me.id, name: me.name, email: me.email, role: me.role };
        setUser(u);
        setStoredUser(u);
      })
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
    // completeLogin は useCallback で stable. dep 配列空でよい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Popup モードでログイン (Backend 経由)
   * 1. Backend の /api/auth/login-url から Cernere URL を取得
   * 2. Popup で Cernere ログインページを開く
   * 3. postMessage で authCode を受信
   * 4. Backend の /api/auth/exchange で authCode → serviceToken 交換
   */
  const loginWithPopup = useCallback(async () => {
    const origin = window.location.origin;

    const urlRes = await fetch(`${API_BASE}/api/auth/login-url?origin=${encodeURIComponent(origin)}`);
    if (!urlRes.ok) throw new Error("Failed to get login URL");
    const { url } = await urlRes.json() as { url: string };

    const width = 480;
    const height = 640;
    const left = Math.round(window.screenX + (window.innerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.innerHeight - height) / 2);

    const popup = window.open(
      url,
      "cernere-login",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
    );

    if (!popup) throw new Error("Popup blocked. Please allow popups.");

    const authCode = await new Promise<string>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "cernere:auth" && data.authCode) {
          cleanup();
          popup.close();
          resolve(data.authCode as string);
        } else if (data.type === "cernere:auth_error") {
          cleanup();
          popup.close();
          reject(new Error(data.error as string));
        }
      };

      const pollTimer = setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new Error("Login popup was closed."));
        }
      }, 500);

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearInterval(pollTimer);
      };

      window.addEventListener("message", onMessage);
    });

    await completeLogin(authCode);
  }, []);

  /**
   * authCode を受け取って backend で serviceToken に交換 → セッション確立。
   * Popup モードと埋め込みモード両方で使う共通処理。
   */
  const completeLogin = useCallback(async (authCode: string) => {
    const exchangeRes = await fetch(`${API_BASE}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // HttpOnly Cookie を受け取る
      body: JSON.stringify({ authCode }),
    });

    if (!exchangeRes.ok) {
      const err = await exchangeRes.json().catch(() => ({ error: "Exchange failed" }));
      throw new Error((err as { error: string }).error);
    }

    const result = await exchangeRes.json() as {
      user: { id: string; displayName: string; email: string; role: string };
    };

    const u = {
      id: result.user.id,
      name: result.user.displayName,
      email: result.user.email,
      role: result.user.role,
    };
    setUser(u);
    setStoredUser(u);
  }, []);

  const logout = useCallback(async () => {
    wsClient.disconnect();
    setWsConnected(false);
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, wsConnected, loginWithPopup, completeLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
