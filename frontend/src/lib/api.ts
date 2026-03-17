import { API_BASE } from "./constants";

// ─── Token Management ──────────────────────────────────────

function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("accessToken", access);
  localStorage.setItem("refreshToken", refresh);
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

export function getStoredUser(): { id: string; name: string; email: string; role: string } | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setStoredUser(user: { id: string; name: string; email: string; role: string }) {
  localStorage.setItem("user", JSON.stringify(user));
}

// ─── Core Request ──────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add JWT if available
  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Fallback: legacy header auth
  const user = getStoredUser();
  if (user) {
    headers["X-User-Id"] = user.id;
    headers["X-User-Role"] = user.role;
  }

  let res: Response;
  try {
    console.log(`[api] ${options.method || "GET"} ${url}`);
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    console.error(`[api] ネットワークエラー: ${options.method || "GET"} ${url}`, err);
    throw new Error(`ネットワークエラー: ${(err as Error).message}`);
  }

  // If 401, try refresh
  if (res.status === 401 && getRefreshToken()) {
    console.log("[api] 401 - トークンリフレッシュ試行中...");
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      try {
        res = await fetch(url, { ...options, headers });
      } catch (err) {
        console.error(`[api] リトライ時ネットワークエラー: ${url}`, err);
        throw new Error(`ネットワークエラー: ${(err as Error).message}`);
      }
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[api] HTTPエラー: ${res.status} ${url}`, body);
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// ─── Auth API ──────────────────────────────────────────────

export const auth = {
  async register(body: { name: string; email: string; password: string; role?: string }) {
    console.log("[auth] 登録リクエスト:", body.email);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("[auth] 登録ネットワークエラー:", err);
      throw new Error(`ネットワークエラー: ${(err as Error).message}`);
    }
    const data = await res.json();
    if (!res.ok) {
      console.error("[auth] 登録失敗:", res.status, data);
      throw new Error(data.error || "Registration failed");
    }
    console.log("[auth] 登録成功");
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    return data;
  },

  async login(body: { email: string; password: string }) {
    console.log("[auth] ログインリクエスト:", body.email);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("[auth] ログインネットワークエラー:", err);
      throw new Error(`ネットワークエラー: ${(err as Error).message}`);
    }
    const data = await res.json();
    if (!res.ok) {
      console.error("[auth] ログイン失敗:", res.status, data);
      throw new Error(data.error || "Login failed");
    }
    console.log("[auth] ログイン成功");
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    return data;
  },

  async logout() {
    console.log("[auth] ログアウトリクエスト");
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      console.log("[auth] ログアウト成功");
    } catch (err) {
      console.error("[auth] ログアウトネットワークエラー:", err);
    }
    clearTokens();
  },

  getGoogleAuthUrl() {
    // Always use relative URL so navigation goes through the frontend proxy (Vite/Nginx)
    // instead of navigating directly to the backend port
    return "/api/auth/google";
  },

  async me() {
    return request<any>("/api/auth/me");
  },
};

// ─── M1 ─────────────────────────────────────────────────────

export const m1 = {
  importInstructors(csvText: string) {
    return fetch(`${API_BASE}/api/m1/instructors/import`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: csvText,
    }).then((r) => r.json());
  },
  importRooms(csvText: string) {
    return fetch(`${API_BASE}/api/m1/rooms/import`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: csvText,
    }).then((r) => r.json());
  },
  importCurriculum(csvText: string) {
    return fetch(`${API_BASE}/api/m1/curriculum/import`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: csvText,
    }).then((r) => r.json());
  },
  generate(mode: "pack" | "spread") {
    return request<any>(`/api/m1/schedule/generate?mode=${mode}`, {
      method: "POST",
    });
  },
  getSchedule() {
    return request<any>("/api/m1/schedule");
  },
  swap(body: {
    fromDay: number;
    fromPeriod: number;
    toDay: number;
    toPeriod: number;
  }) {
    return request<any>("/api/m1/schedule/swap", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  confirm() {
    return request<any>("/api/m1/schedule/confirm", { method: "POST" });
  },
};

// ─── M3 ─────────────────────────────────────────────────────

export const m3 = {
  createGroup(body: { name: string; members: string[]; createdBy: string }) {
    return request<any>("/api/m3/groups", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  getGroup(groupId: string) {
    return request<any>(`/api/m3/groups/${groupId}`);
  },
  updateMembers(groupId: string, members: string[]) {
    return request<any>(`/api/m3/groups/${groupId}/members`, {
      method: "PUT",
      body: JSON.stringify({ members }),
    });
  },
  getAvailability(groupId: string) {
    return request<any>(`/api/m3/groups/${groupId}/availability`);
  },
  getSuggestions(groupId: string) {
    return request<any>(`/api/m3/groups/${groupId}/suggestions`);
  },
};

// ─── M4 ─────────────────────────────────────────────────────

export const m4 = {
  createReservation(body: {
    groupId: string;
    title: string;
    day: number;
    period: number;
    roomId: string;
    participants: string[];
    note?: string;
  }) {
    return request<any>("/api/m4/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listReservations() {
    return request<any>("/api/m4/reservations");
  },
  getReservation(id: string) {
    return request<any>(`/api/m4/reservations/${id}`);
  },
  updateReservation(
    id: string,
    body: { title?: string; note?: string; version: number }
  ) {
    return request<any>(`/api/m4/reservations/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  cancelReservation(id: string) {
    return request<any>(`/api/m4/reservations/${id}`, { method: "DELETE" });
  },
  getRoomSchedule(roomId: string) {
    return request<any>(`/api/m4/rooms/${roomId}/schedule`);
  },
};

// ─── M5 ─────────────────────────────────────────────────────

export const m5 = {
  listWebhooks() {
    return request<any>("/api/m5/webhooks");
  },
  createWebhook(body: { url: string; events: string[] }) {
    return request<any>("/api/m5/webhooks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteWebhook(id: string) {
    return request<any>(`/api/m5/webhooks/${id}`, { method: "DELETE" });
  },
  testWebhook(id: string) {
    return request<any>(`/api/m5/webhooks/${id}/test`, { method: "POST" });
  },
  rotateSecret(id: string) {
    return request<any>(`/api/m5/webhooks/${id}/rotate-secret`, {
      method: "POST",
    });
  },
  getWebhookLogs(id: string) {
    return request<any>(`/api/m5/webhooks/${id}/logs`);
  },
  getPreferences() {
    return request<any>("/api/m5/notifications/preferences");
  },
  updatePreferences(body: any) {
    return request<any>("/api/m5/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  getHistory() {
    return request<any>("/api/m5/notifications/history");
  },
  markRead(id: string) {
    return request<any>(`/api/m5/notifications/${id}/read`, {
      method: "POST",
    });
  },
};
