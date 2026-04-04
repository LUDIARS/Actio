import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { auth as authApi, getStoredUser, setTokens, setStoredUser } from "../lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  googleAuthUrl: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [loading, setLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = getStoredUser();
    return !!(stored || params.get("code"));
  });

  useEffect(() => {
    // Check for OAuth callback code or errors in URL
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("code");
    const authError = params.get("authError");

    if (authError) {
      console.error("[AuthContext] OAuthエラー:", authError);
      window.history.replaceState({}, "", window.location.pathname);
    }

    async function handleOAuthCode(code: string) {
      try {
        console.log("[AuthContext] OAuth一時コードを交換中...");
        // Clean URL immediately to prevent replay
        window.history.replaceState({}, "", window.location.pathname);
        const data = await authApi.exchange(code);
        setTokens(data.accessToken, data.refreshToken);
        const me = await authApi.me();
        setUser({ id: me.id, name: me.name, email: me.email, role: me.role });
        setStoredUser({ id: me.id, name: me.name, email: me.email, role: me.role });
      } catch (err) {
        console.error("[AuthContext] OAuth コード交換失敗:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    if (oauthCode) {
      handleOAuthCode(oauthCode);
      return;
    }

    // Validate stored session
    const stored = getStoredUser();
    if (stored) {
      console.log("[AuthContext] セッション検証中...");
      authApi.me()
        .then((me) => {
          console.log("[AuthContext] セッション有効 userId:", me.id);
          setUser({ id: me.id, name: me.name, email: me.email, role: me.role });
          setStoredUser({ id: me.id, name: me.name, email: me.email, role: me.role });
        })
        .catch((err) => {
          console.error("[AuthContext] セッション検証失敗:", err);
          setUser(null);
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password });
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await authApi.register({ name, email, password });
    setUser(data.user);
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
        register,
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
