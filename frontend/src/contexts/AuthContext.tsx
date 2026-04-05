import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { auth as authApi, getStoredUser, setTokens, setStoredUser, clearTokens } from "../lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  googleAuthUrl: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [loading, setLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = getStoredUser();
    return !!(stored || (params.get("accessToken") && params.get("refreshToken")));
  });

  useEffect(() => {
    // Cernere からのコールバック: URL パラメータからトークンを取得
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const authError = params.get("authError");

    if (authError) {
      console.error("[AuthContext] 認証エラー:", authError);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // セッション検証
    const stored = getStoredUser();
    if (stored || (accessToken && refreshToken)) {
      authApi.me()
        .then((me) => {
          const u = { id: me.id, name: me.name, email: me.email, role: me.role };
          setUser(u);
          setStoredUser(u);
        })
        .catch((err) => {
          console.error("[AuthContext] セッション検証失敗:", err);
          clearTokens();
          setUser(null);
        })
        .finally(() => setLoading(false));
    }
  }, []);

  // Cernere ログインページへリダイレクト
  const login = useCallback(() => {
    window.location.href = authApi.getCernereLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        googleAuthUrl: authApi.getGoogleAuthUrl(),
      }}
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
