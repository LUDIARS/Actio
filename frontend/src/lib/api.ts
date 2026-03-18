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

// ─── Calendar (Google Calendar + 手動予定 + プラン) ────────

export const calendarApi = {
  // Google Calendar
  getEvents(params?: { timeMin?: string; timeMax?: string }) {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : "";
    return request<any>(`/api/calendar/events${query}`);
  },
  getCalendars() {
    return request<any>("/api/calendar/calendars");
  },
  getStatus() {
    return request<any>("/api/calendar/status");
  },
  disconnect() {
    return request<any>("/api/calendar/disconnect", { method: "POST" });
  },

  // Personal Events (手動予定)
  getPersonalEvents() {
    return request<any>("/api/calendar/personal");
  },
  createPersonalEvent(body: {
    title: string;
    description?: string;
    day: number;
    period: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }) {
    return request<any>("/api/calendar/personal", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updatePersonalEvent(id: string, body: {
    title?: string;
    description?: string;
    day?: number;
    period?: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }) {
    return request<any>(`/api/calendar/personal/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deletePersonalEvent(id: string) {
    return request<any>(`/api/calendar/personal/${id}`, { method: "DELETE" });
  },

  // Plans (プラン)
  getPlans() {
    return request<any>("/api/calendar/plans");
  },
  createPlan(body: {
    name: string;
    description?: string;
    days: number[];
    startPeriod: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }) {
    return request<any>("/api/calendar/plans", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updatePlan(id: string, body: {
    name?: string;
    description?: string;
    days?: number[];
    startPeriod?: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
    isActive?: boolean;
  }) {
    return request<any>(`/api/calendar/plans/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deletePlan(id: string) {
    return request<any>(`/api/calendar/plans/${id}`, { method: "DELETE" });
  },
  regeneratePlan(id: string) {
    return request<any>(`/api/calendar/plans/${id}/regenerate`, { method: "POST" });
  },
  getConflicts() {
    return request<any>("/api/calendar/conflicts");
  },
};

// ─── M1 Schema CRUD (学科・講師・カリキュラム・出講可能スロット) ──

export const m1Schema = {
  // 学科 (Departments)
  getDepartments() {
    return request<{ departments: any[] }>("/api/m1/departments");
  },
  createDepartment(name: string) {
    return request<any>("/api/m1/departments", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  updateDepartment(id: string, name: string) {
    return request<any>(`/api/m1/departments/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },
  deleteDepartment(id: string) {
    return request<any>(`/api/m1/departments/${id}`, { method: "DELETE" });
  },

  // 講師 (Instructors)
  getInstructors() {
    return request<{ instructors: any[] }>("/api/m1/instructors");
  },
  createInstructor(name: string) {
    return request<any>("/api/m1/instructors", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  updateInstructor(id: string, name: string) {
    return request<any>(`/api/m1/instructors/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },
  deleteInstructor(id: string) {
    return request<any>(`/api/m1/instructors/${id}`, { method: "DELETE" });
  },

  // カリキュラム (Curricula)
  getCurricula() {
    return request<{ curricula: any[] }>("/api/m1/curricula");
  },
  getCurriculaByDepartment(departmentId: string) {
    return request<{ curricula: any[] }>(`/api/m1/departments/${departmentId}/curricula`);
  },
  createCurriculum(departmentId: string, name: string, instructorId?: string, periods?: number, departmentIds?: string[]) {
    return request<any>(`/api/m1/departments/${departmentId}/curricula`, {
      method: "POST",
      body: JSON.stringify({ name, instructorId, periods, departmentIds }),
    });
  },
  updateCurriculum(id: string, body: { name?: string; instructorId?: string | null; periods?: number; departmentIds?: string[] }) {
    return request<any>(`/api/m1/curricula/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteCurriculum(id: string) {
    return request<any>(`/api/m1/curricula/${id}`, { method: "DELETE" });
  },

  // 出講可能スロット (Instructor Available Slots)
  getAvailability(instructorId: string) {
    return request<{ slots: any[] }>(`/api/m1/instructors/${instructorId}/availability`);
  },
  setAvailability(instructorId: string, slots: { day: number; periods: number[] }[]) {
    return request<any>(`/api/m1/instructors/${instructorId}/availability`, {
      method: "PUT",
      body: JSON.stringify({ slots }),
    });
  },
};

// ─── M1 (Legacy CSV/Generate) ────────────────────────────────

export const m1 = {
  async importInstructors(csvText: string) {
    const url = `${API_BASE}/api/m1/instructors/import`;
    console.log(`[api] POST ${url}`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: csvText,
      });
    } catch (err) {
      console.error(`[api] ネットワークエラー: POST ${url}`, err);
      throw new Error(`ネットワークエラー: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[api] HTTPエラー: ${res.status} ${url}`, body);
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  async importRooms(csvText: string) {
    const url = `${API_BASE}/api/m1/rooms/import`;
    console.log(`[api] POST ${url}`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: csvText,
      });
    } catch (err) {
      console.error(`[api] ネットワークエラー: POST ${url}`, err);
      throw new Error(`ネットワークエラー: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[api] HTTPエラー: ${res.status} ${url}`, body);
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  async importCurriculum(csvText: string) {
    const url = `${API_BASE}/api/m1/curriculum/import`;
    console.log(`[api] POST ${url}`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: csvText,
      });
    } catch (err) {
      console.error(`[api] ネットワークエラー: POST ${url}`, err);
      throw new Error(`ネットワークエラー: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[api] HTTPエラー: ${res.status} ${url}`, body);
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
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

// ─── Settings (アプリ設定) ──────────────────────────────────────

export const settingsApi = {
  getSettings() {
    return request<{ settings: Record<string, string> }>("/api/settings");
  },
  updateSettings(settings: Record<string, string>) {
    return request<{ settings: Record<string, string>; message: string }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    });
  },
  getExportUrl() {
    return `${API_BASE}/api/settings/export`;
  },
};

// ─── Admin (ユーザー管理) ──────────────────────────────────────

export const adminApi = {
  listUsers() {
    return request<any>("/api/auth/users");
  },
  listUsersByGroup() {
    return request<any>("/api/auth/users/list");
  },
  updateUserRole(userId: string, role: string) {
    return request<any>(`/api/auth/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
  },
};

// ─── Admin DB Viewer (テスト用) ──────────────────────────────

export const adminDbApi = {
  listTables() {
    return request<{ tables: string[] }>("/api/admin/db/tables");
  },
  getTableData(tableName: string, limit = 50, offset = 0) {
    return request<{
      table: string;
      columns: string[];
      rows: Record<string, unknown>[];
      totalRows: number;
      limit: number;
      offset: number;
    }>(`/api/admin/db/tables/${tableName}?limit=${limit}&offset=${offset}`);
  },
};

// ─── Groups ──────────────────────────────────────────────────

export const groupApi = {
  listMyGroups() {
    return request<any>("/api/groups/my");
  },
  getGroup(groupId: string) {
    return request<any>(`/api/groups/${groupId}`);
  },
  createGroup(body: { name: string; description?: string }) {
    return request<any>("/api/groups", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  joinGroup(groupId: string) {
    return request<any>(`/api/groups/${groupId}/join`, { method: "POST" });
  },
  leaveGroup(groupId: string) {
    return request<any>(`/api/groups/${groupId}/leave`, { method: "POST" });
  },
  addSchedule(groupId: string, body: {
    title: string;
    day: number;
    period: number;
    duration?: number;
    scheduleType?: string;
    date?: string;
  }) {
    return request<any>(`/api/groups/${groupId}/schedules`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};

// ─── MyPlan ──────────────────────────────────────────────────

export const myPlanApi = {
  list() {
    return request<any>("/api/myplans");
  },
  create(body: {
    name: string;
    patternType: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule: Record<string, Array<{ startTime: string; endTime: string; title: string }>>;
    groupId?: string;
  }) {
    return request<any>("/api/myplans", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: {
    name?: string;
    patternType?: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule?: Record<string, Array<{ startTime: string; endTime: string; title: string }>>;
    isActive?: boolean;
  }) {
    return request<any>(`/api/myplans/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  remove(id: string) {
    return request<any>(`/api/myplans/${id}`, { method: "DELETE" });
  },
  generateSchedule(id: string) {
    return request<any>(`/api/myplans/${id}/generate`, { method: "POST" });
  },
};

// ─── Smart Scheduler (汎用自動配置) ─────────────────────────

export const smartSchedulerApi = {
  getTasks(groupId: string) {
    return request<any>(`/api/smart-scheduler/tasks/${groupId}`);
  },
  createTask(body: {
    groupId: string;
    title: string;
    duration?: number;
    priority?: number;
    preferredDays?: number[];
    preferredPeriods?: number[];
  }) {
    return request<any>("/api/smart-scheduler/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateTask(id: string, body: {
    title?: string;
    duration?: number;
    priority?: number;
    preferredDays?: number[];
    preferredPeriods?: number[];
  }) {
    return request<any>(`/api/smart-scheduler/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteTask(id: string) {
    return request<any>(`/api/smart-scheduler/tasks/${id}`, { method: "DELETE" });
  },
  solve(groupId: string) {
    return request<any>(`/api/smart-scheduler/solve/${groupId}`, { method: "POST" });
  },
  confirm(resultId: string) {
    return request<any>(`/api/smart-scheduler/confirm/${resultId}`, { method: "POST" });
  },
  getResults(groupId: string) {
    return request<any>(`/api/smart-scheduler/results/${groupId}`);
  },
  getAvailability(groupId: string) {
    return request<any>(`/api/smart-scheduler/availability/${groupId}`);
  },
};

// ─── M6: Voting ─────────────────────────────────────────────

export const m6Voting = {
  createEvent(body: {
    title: string;
    description?: string;
    deadline?: string;
    candidates: string[];
  }) {
    return request<any>("/api/voting/events", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listEvents() {
    return request<any>("/api/voting/events");
  },
  getEvent(eventId: string) {
    return request<any>(`/api/voting/events/${eventId}`);
  },
  submitVotes(
    eventId: string,
    votes: { candidateId: string; answer: string; comment?: string }[]
  ) {
    return request<any>(`/api/voting/events/${eventId}/votes`, {
      method: "POST",
      body: JSON.stringify({ votes }),
    });
  },
  autoReply(eventId: string) {
    return request<any>(`/api/voting/events/${eventId}/auto-reply`, {
      method: "POST",
    });
  },
  updateEvent(
    eventId: string,
    body: { status?: string; title?: string; description?: string; deadline?: string }
  ) {
    return request<any>(`/api/voting/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteEvent(eventId: string) {
    return request<any>(`/api/voting/events/${eventId}`, {
      method: "DELETE",
    });
  },
};
