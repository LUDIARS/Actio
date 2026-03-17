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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for OAuth callback tokens or errors in URL
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const authError = params.get("authError");

    if (authError) {
      console.error("[AuthContext] OAuthエラー:", authError);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (accessToken && refreshToken) {
      console.log("[AuthContext] OAuthコールバックトークン検出");
      setTokens(accessToken, refreshToken);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Validate stored session
    const stored = getStoredUser();
    if (stored || (accessToken && refreshToken)) {
      console.log("[AuthContext] セッション検証中...");
      authApi.me()
        .then((me) => {
          console.log("[AuthContext] セッション有効 userId:", me.id);
          setUser({ id: me.id, name: me.name, email: me.email, role: me.role });
          setStoredUser({ id: me.id, name: me.name, email: me.email, role: me.role });
        })
        .catch((err) => {
          console.error("[AuthContext] セッション検証失敗:", err);
          // Token expired/invalid
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
