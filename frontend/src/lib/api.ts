import { API_BASE } from "./constants";
import type {
  UserProfile, UserListResponse, UserListWithGroupsResponse, UserRoleUpdateResponse,
  CalendarEventsResponse, CalendarListResponse, CalendarStatusResponse,
  PersonalEventsResponse, PersonalEvent, PlansResponse, Plan, ConflictsResponse,
  Department, Instructor, Curriculum, AvailableSlot, Room, GroupScheduleEntry,
  GroupMyResponse, GroupDetailResponse, GroupCreateResponse, GroupEventsResponse, GroupEventResponse, GroupScheduleResponse,
  MessageResponse, DeletedResponse,
  Reservation, ReservationListResponse, RoomScheduleResponse,
  WebhookListResponse, WebhookCreateResponse, WebhookTestResponse, WebhookRotateResponse, WebhookLogsResponse,
  NotificationPreferencesResponse, NotificationHistoryResponse,
  NotificationTemplateListResponse, NotificationTemplateResponse, TemplatePreviewResponse, TestSendResponse, MorningReminderResponse,
  NotificationPlatform, SendMethod,
  MyPlanListResponse, MyPlanResponse,
  SchedulingTaskListResponse, SchedulingTaskResponse, SolveResponse, ConfirmResponse, SchedulingResultsResponse, SchedulerAvailabilityResponse,
  VotingEventCreateResponse, VotingEventListResponse, VotingEventDetailResponse, VotingSubmitResponse, VotingAutoReplyResponse, VotingUpdateResponse,
  M3Group, M3AvailabilityResponse, M3SuggestionsResponse,
  ScheduleResponse, GenerateResponse, SwapResponse,
  HolidayListResponse, ActivityLogsResponse,
  ReminderListResponse, ReminderResponse, ReminderParseResponse,
  ProfileResponse, ProfileUpdateResponse, ProjectRolesResponse, ProjectRolesUpdateResponse, GroupProjectRolesResponse,
  MachinaTaskListResponse, MachinaTaskDetailResponse, MachinaTaskLogListResponse,
  MachinaMonitorListResponse, MachinaAnalysisResponse, MachinaStatusResponse,
  PMProject, PMTask, PMTaskSnapshot, PMConflict, PMValidationResult, PMSyncResult,
  PMProgressReport, PMCriticalPathResult, PMDecompositionRecommendation, PMGompertzReport, PMFullReport,
  PMReminderSettings, PMReminderTestResult,
} from "./api-types";

// ─── Session Management ────────────────────────────────────
// service_token は HttpOnly Cookie (schedula_token) で管理 (XSS対策)
// user 情報のみ localStorage に保存 (UX のため)

export function clearUserCache() {
  localStorage.removeItem("user");
}

/** @deprecated Cookie ベースに移行。互換性のため残存。 */
export function clearTokens() {
  clearUserCache();
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

  let res: Response;
  try {
    console.log(`[api] ${options.method || "GET"} ${url}`);
    res = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // HttpOnly Cookie を送信
    });
  } catch (err) {
    console.error(`[api] ネットワークエラー: ${options.method || "GET"} ${url}`, err);
    throw new Error(`ネットワークエラー: ${(err as Error).message}`);
  }

  // 401 → セッション切れ、localStorage の user キャッシュをクリア
  if (res.status === 401) {
    console.warn("[api] 401 - セッション切れ。再ログインが必要です。");
    clearUserCache();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[api] HTTPエラー: ${res.status} ${url}`, body);
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Auth API (認証は Backend 経由 Cernere Composite に委譲) ──

export const auth = {
  async logout() {
    // サーバーでCookie削除
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => { /* 失敗してもローカル状態はクリアする */ });
    clearUserCache();
  },

  async me() {
    return request<UserProfile>("/api/auth/me");
  },
};

// ─── Calendar (Google Calendar + 手動予定 + プラン) ────────

export const calendarApi = {
  // Google Calendar
  getEvents(params?: { timeMin?: string; timeMax?: string }) {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : "";
    return request<CalendarEventsResponse>(`/api/calendar/events${query}`);
  },
  getCalendars() {
    return request<CalendarListResponse>("/api/calendar/calendars");
  },
  getStatus() {
    return request<CalendarStatusResponse>("/api/calendar/status");
  },
  disconnect() {
    return request<MessageResponse>("/api/calendar/disconnect", { method: "POST" });
  },

  // Personal Events (手動予定)
  getPersonalEvents() {
    return request<PersonalEventsResponse>("/api/calendar/personal");
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
    return request<PersonalEvent>("/api/calendar/personal", {
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
    return request<PersonalEvent>(`/api/calendar/personal/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deletePersonalEvent(id: string) {
    return request<DeletedResponse>(`/api/calendar/personal/${id}`, { method: "DELETE" });
  },

  // Plans (プラン)
  getPlans() {
    return request<PlansResponse>("/api/calendar/plans");
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
    return request<Plan>("/api/calendar/plans", {
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
    return request<Plan>(`/api/calendar/plans/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deletePlan(id: string) {
    return request<DeletedResponse>(`/api/calendar/plans/${id}`, { method: "DELETE" });
  },
  regeneratePlan(id: string) {
    return request<MessageResponse>(`/api/calendar/plans/${id}/regenerate`, { method: "POST" });
  },
  getConflicts() {
    return request<ConflictsResponse>("/api/calendar/conflicts");
  },
};

// ─── M1 Schema CRUD (学科・講師・カリキュラム・出講可能スロット) ──

export const m1Schema = {
  // 学科 (Departments)
  getDepartments() {
    return request<{ departments: Department[] }>("/api/m1/departments");
  },
  createDepartment(name: string) {
    return request<Department>("/api/m1/departments", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  updateDepartment(id: string, name: string) {
    return request<Department>(`/api/m1/departments/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },
  deleteDepartment(id: string) {
    return request<DeletedResponse>(`/api/m1/departments/${id}`, { method: "DELETE" });
  },

  // 講師 (Instructors)
  getInstructors() {
    return request<{ instructors: Instructor[] }>("/api/m1/instructors");
  },
  createInstructor(name: string) {
    return request<Instructor>("/api/m1/instructors", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  updateInstructor(id: string, name: string) {
    return request<Instructor>(`/api/m1/instructors/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },
  deleteInstructor(id: string) {
    return request<DeletedResponse>(`/api/m1/instructors/${id}`, { method: "DELETE" });
  },

  // カリキュラム (Curricula)
  getCurricula() {
    return request<{ curricula: Curriculum[] }>("/api/m1/curricula");
  },
  getCurriculaByDepartment(departmentId: string) {
    return request<{ curricula: Curriculum[] }>(`/api/m1/departments/${departmentId}/curricula`);
  },
  createCurriculum(departmentId: string, name: string, instructorId?: string, periods?: number, departmentIds?: string[], termId?: string) {
    return request<Curriculum>(`/api/m1/departments/${departmentId}/curricula`, {
      method: "POST",
      body: JSON.stringify({ name, instructorId, periods, departmentIds, termId }),
    });
  },
  updateCurriculum(id: string, body: { name?: string; instructorId?: string | null; periods?: number; departmentIds?: string[]; termId?: string | null }) {
    return request<Curriculum>(`/api/m1/curricula/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteCurriculum(id: string) {
    return request<DeletedResponse>(`/api/m1/curricula/${id}`, { method: "DELETE" });
  },

  // 出講可能スロット (Instructor Available Slots)
  getAvailability(instructorId: string) {
    return request<{ slots: AvailableSlot[] }>(`/api/m1/instructors/${instructorId}/availability`);
  },
  setAvailability(instructorId: string, slots: { day: number; periods: number[] }[]) {
    return request<MessageResponse>(`/api/m1/instructors/${instructorId}/availability`, {
      method: "PUT",
      body: JSON.stringify({ slots }),
    });
  },

  // 配置確定 → グループスケジュールとして登録
  confirmPlacements(placements: Array<{
    curriculumId: string;
    curriculumName: string;
    day: number;
    period: number;
    duration: number;
    departmentNames: string[];
  }>, label?: string, options?: { considerHolidays?: boolean; considerBusinessDays?: boolean }) {
    return request<{ message: string; schedulesCreated: number; groupsCreated: number; deletedCount: number; label: string | null }>(
      "/api/m1/confirm-placements",
      { method: "POST", body: JSON.stringify({ placements, label, ...options }) }
    );
  },

  // グループスケジュール一覧取得 (DB管理用)
  getGroupSchedules() {
    return request<{ schedules: GroupScheduleEntry[] }>("/api/m1/group-schedules");
  },

  // グループスケジュール個別削除
  deleteGroupSchedule(id: string) {
    return request<{ deleted: string }>(`/api/m1/group-schedules/${id}`, { method: "DELETE" });
  },

  // ラベル単位でグループスケジュールを一括削除
  deleteGroupSchedulesByLabel(label: string) {
    return request<{ deletedCount: number; label: string }>(`/api/m1/group-schedules/by-label/${encodeURIComponent(label)}`, { method: "DELETE" });
  },

  // ターム (Terms)
  getTerms() {
    return request<{ terms: Array<{ id: string; name: string; startDate: string; endDate: string }> }>("/api/m1/terms");
  },
  createTerm(name: string, startDate: string, endDate: string) {
    return request<{ id: string; name: string }>("/api/m1/terms", {
      method: "POST",
      body: JSON.stringify({ name, startDate, endDate }),
    });
  },
  updateTerm(id: string, body: { name?: string; startDate?: string; endDate?: string }) {
    return request<{ id: string }>(`/api/m1/terms/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteTerm(id: string) {
    return request<{ deleted: string }>(`/api/m1/terms/${id}`, { method: "DELETE" });
  },

  // カリキュラム配置 (Placements)
  getPlacements(termId: string) {
    return request<{ placements: Array<{ id: string; termId: string; curriculumId: string; day: number; period: number; roomId?: string; candidateCount: number }> }>(`/api/m1/terms/${termId}/placements`);
  },
  savePlacements(termId: string, placements: Array<{
    curriculumId: string;
    day: number;
    period: number;
    roomId?: string;
    candidateCount?: number;
  }>) {
    return request<{ message: string; count: number }>(
      `/api/m1/terms/${termId}/placements`,
      { method: "PUT", body: JSON.stringify({ placements }) }
    );
  },
  swapPlacement(termId: string, fromDay: number, fromPeriod: number, toDay: number, toPeriod: number) {
    return request<{ message: string }>(
      `/api/m1/terms/${termId}/placements/swap`,
      { method: "POST", body: JSON.stringify({ fromDay, fromPeriod, toDay, toPeriod }) }
    );
  },

  // カリキュラム決定
  decideTerm(termId: string) {
    return request<{ message: string; labelPrefix: string; plansCreated: number; results: Array<{ departmentName: string; plansCreated: number }> }>(
      `/api/m1/terms/${termId}/decide`,
      { method: "POST" }
    );
  },

  // エクスポート / インポート
  exportData() {
    return request<{ version: number; exportedAt: string; departments: Array<{ name: string }>; instructors: Array<{ name: string }>; curricula: Array<{ name: string }> }>("/api/m1/export");
  },
  importData(data: {
    departments?: Array<{ name: string }>;
    instructors?: Array<{ name: string; availability?: Array<{ day: number; periods: number[] }> }>;
    curricula?: Array<{
      name: string;
      departmentName: string;
      instructorName?: string | null;
      periods?: number;
      departmentNames?: string[];
    }>;
    termName?: string;
    termStartDate?: string;
    termEndDate?: string;
  }) {
    return request<{ message: string; departmentsCreated: number; instructorsCreated: number; curriculaCreated: number }>("/api/m1/import", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  // 教室 (Rooms)
  getRooms() {
    return request<{ rooms: Room[] }>("/api/m1/rooms");
  },
  createRoom(body: { name: string; capacity?: number; type?: string; equipment?: string[] }) {
    return request<Room>("/api/m1/rooms", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateRoom(id: string, body: { name?: string; capacity?: number; type?: string; equipment?: string[] }) {
    return request<Room>(`/api/m1/rooms/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteRoom(id: string) {
    return request<DeletedResponse>(`/api/m1/rooms/${id}`, { method: "DELETE" });
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
    return request<GenerateResponse>(`/api/m1/schedule/generate?mode=${mode}`, {
      method: "POST",
    });
  },
  getSchedule() {
    return request<ScheduleResponse>("/api/m1/schedule");
  },
  swap(body: {
    fromDay: number;
    fromPeriod: number;
    toDay: number;
    toPeriod: number;
  }) {
    return request<SwapResponse>("/api/m1/schedule/swap", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  confirm() {
    return request<MessageResponse>("/api/m1/schedule/confirm", { method: "POST" });
  },
};

// ─── M3 ─────────────────────────────────────────────────────

export const m3 = {
  createGroup(body: { name: string; members: string[]; createdBy: string }) {
    return request<M3Group>("/api/m3/groups", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  getGroup(groupId: string) {
    return request<M3Group>(`/api/m3/groups/${groupId}`);
  },
  updateMembers(groupId: string, members: string[]) {
    return request<M3Group>(`/api/m3/groups/${groupId}/members`, {
      method: "PUT",
      body: JSON.stringify({ members }),
    });
  },
  getAvailability(groupId: string) {
    return request<M3AvailabilityResponse>(`/api/m3/groups/${groupId}/availability`);
  },
  getSuggestions(groupId: string) {
    return request<M3SuggestionsResponse>(`/api/m3/groups/${groupId}/suggestions`);
  },
};

// ─── Reservation Plugins ────────────────────────────────────

export const reservationPluginsApi = {
  listPlugins() {
    return request<any>("/api/reservations/plugins");
  },
};

// ─── Facility Booking (施設予約 — M1) ───────────────────────

const FACILITY_BASE = "/api/school/facility-booking";

export const facilityBooking = {
  createReservation(body: {
    groupId: string;
    title: string;
    day: number;
    period: number;
    roomId: string;
    participants: string[];
    participantGroupIds?: string[];
    note?: string;
  }) {
    return request<Reservation>(`${FACILITY_BASE}/reservations`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listReservations() {
    return request<ReservationListResponse>(`${FACILITY_BASE}/reservations`);
  },
  getReservation(id: string) {
    return request<Reservation>(`${FACILITY_BASE}/reservations/${id}`);
  },
  updateReservation(
    id: string,
    body: { title?: string; note?: string; version: number }
  ) {
    return request<Reservation>(`${FACILITY_BASE}/reservations/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  cancelReservation(id: string) {
    return request<{ message: string; reservation: Reservation }>(`${FACILITY_BASE}/reservations/${id}`, { method: "DELETE" });
  },
  getRoomSchedule(roomId: string) {
    return request<RoomScheduleResponse>(`${FACILITY_BASE}/rooms/${roomId}/schedule`);
  },
  getRoomsAvailability() {
    return request<{ rooms: Array<{ id: string; name: string; capacity: number; type: string; freeSlots: Array<{ day: number; period: number }>; occupiedCount: number }> }>(`${FACILITY_BASE}/rooms/availability`);
  },
};

// ─── M5 ─────────────────────────────────────────────────────

export const m5 = {
  listWebhooks() {
    return request<WebhookListResponse>("/api/m5/webhooks");
  },
  createWebhook(body: {
    url: string;
    events: string[];
    platform?: NotificationPlatform;
    sendMethod?: SendMethod;
    botToken?: string;
    channelId?: string;
  }) {
    return request<WebhookCreateResponse>("/api/m5/webhooks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteWebhook(id: string) {
    return request<MessageResponse>(`/api/m5/webhooks/${id}`, { method: "DELETE" });
  },
  testWebhook(id: string) {
    return request<WebhookTestResponse>(`/api/m5/webhooks/${id}/test`, { method: "POST" });
  },
  rotateSecret(id: string) {
    return request<WebhookRotateResponse>(`/api/m5/webhooks/${id}/rotate-secret`, {
      method: "POST",
    });
  },
  getWebhookLogs(id: string) {
    return request<WebhookLogsResponse>(`/api/m5/webhooks/${id}/logs`);
  },
  getPreferences() {
    return request<NotificationPreferencesResponse>("/api/m5/notifications/preferences");
  },
  updatePreferences(body: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/m5/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  getHistory() {
    return request<NotificationHistoryResponse>("/api/m5/notifications/history");
  },
  markRead(id: string) {
    return request<MessageResponse>(`/api/m5/notifications/${id}/read`, {
      method: "POST",
    });
  },
  deleteNotification(id: string) {
    return request<MessageResponse>(`/api/m5/notifications/${id}`, {
      method: "DELETE",
    });
  },
  // Template CRUD
  listTemplates() {
    return request<NotificationTemplateListResponse>("/api/m5/templates");
  },
  createTemplate(body: {
    event: string;
    platform?: string;
    title: string;
    body: string;
    useCodeBlock?: boolean;
    codeBlockLang?: string;
  }) {
    return request<NotificationTemplateResponse>("/api/m5/templates", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateTemplate(id: string, body: {
    event?: string;
    platform?: string;
    title?: string;
    body?: string;
    useCodeBlock?: boolean;
    codeBlockLang?: string;
  }) {
    return request<NotificationTemplateResponse>(`/api/m5/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteTemplate(id: string) {
    return request<MessageResponse>(`/api/m5/templates/${id}`, { method: "DELETE" });
  },
  previewTemplate(body: {
    event: string;
    platform?: string;
    sampleData?: Record<string, unknown>;
  }) {
    return request<TemplatePreviewResponse>("/api/m5/templates/preview", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  // Test send
  testSend(body: {
    endpointId: string;
    event?: string;
    sampleData?: Record<string, unknown>;
  }) {
    return request<TestSendResponse>("/api/m5/test-send", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  // Morning reminder
  triggerMorningReminder() {
    return request<MorningReminderResponse>("/api/m5/morning-reminder", {
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

// ─── Profile (プロフィール & プロジェクトロール) ──────────────────

export const profileApi = {
  getMyProfile() {
    return request<ProfileResponse>("/api/profile/me");
  },
  updateMyProfile(data: { bio?: string; displayName?: string | null; avatarUrl?: string | null }) {
    return request<ProfileUpdateResponse>("/api/profile/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  getUserProfile(userId: string) {
    return request<ProfileResponse>(`/api/profile/users/${userId}`);
  },
  getMyRoles() {
    return request<ProjectRolesResponse>("/api/profile/me/roles");
  },
  updateMyRoles(groupId: string, roles: string[]) {
    return request<ProjectRolesUpdateResponse>(`/api/profile/me/roles/${groupId}`, {
      method: "PUT",
      body: JSON.stringify({ roles }),
    });
  },
  getGroupRoles(groupId: string) {
    return request<GroupProjectRolesResponse>(`/api/profile/groups/${groupId}/roles`);
  },
};

// ─── Admin (ユーザー管理) ──────────────────────────────────────

export const adminApi = {
  listUsers() {
    return request<UserListResponse>("/api/auth/users");
  },
  listUsersByGroup() {
    return request<UserListWithGroupsResponse>("/api/auth/users/list");
  },
  updateUserRole(userId: string, role: string) {
    return request<UserRoleUpdateResponse>(`/api/auth/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
  },
};

// ─── Activity Logs (操作ログ) ──────────────────────────────────

export const activityLogApi = {
  getLogs(limit = 50) {
    return request<ActivityLogsResponse>(`/api/admin/activity-logs?limit=${limit}`);
  },
};

// ─── Secrets (シークレット管理: Infisical) ───────────────────

export const secretsApi = {
  getStatus() {
    return request<{ infisicalEnabled: boolean; ssmEnabled: boolean; providerType: string; cachedSecretCount: number }>("/api/secrets/status");
  },
  listKeys() {
    return request<{ keys: Array<{ key: string; scope: "shared" | "personal"; hasValue: boolean }> }>("/api/secrets/keys");
  },
  getValue(key: string) {
    return request<{ key: string; masked: string; length: number }>(`/api/secrets/value/${encodeURIComponent(key)}`);
  },
  refresh() {
    return request<{ message: string; cachedSecretCount: number }>("/api/secrets/refresh", {
      method: "POST",
    });
  },
  setSecret(key: string, value: string, scope: "shared" | "personal" = "shared") {
    return request<{ message: string; scope: string }>(`/api/secrets/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, scope }),
    });
  },
  deleteSecret(key: string, scope: "shared" | "personal" = "shared") {
    return request<{ message: string }>(`/api/secrets/${encodeURIComponent(key)}?scope=${scope}`, {
      method: "DELETE",
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
    return request<GroupMyResponse>("/api/groups/my");
  },
  getGroup(groupId: string) {
    return request<GroupDetailResponse>(`/api/groups/${groupId}`);
  },
  createGroup(body: { name: string; description?: string }) {
    return request<GroupCreateResponse>("/api/groups", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  joinGroup(groupId: string) {
    return request<MessageResponse>(`/api/groups/${groupId}/join`, { method: "POST" });
  },
  leaveGroup(groupId: string) {
    return request<MessageResponse>(`/api/groups/${groupId}/leave`, { method: "POST" });
  },
  addSchedule(groupId: string, body: {
    title: string;
    day: number;
    period: number;
    duration?: number;
    scheduleType?: string;
    date?: string;
  }) {
    return request<GroupScheduleResponse>(`/api/groups/${groupId}/schedules`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  // グループ個別予定
  getEvents(groupId: string) {
    return request<GroupEventsResponse>(`/api/groups/${groupId}/events`);
  },
  addEvent(groupId: string, body: {
    title: string;
    description?: string;
    date: string;
    endDate?: string;
    allDay?: boolean;
    period?: number;
    duration?: number;
    eventType?: string;
  }) {
    return request<GroupEventResponse>(`/api/groups/${groupId}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateEvent(groupId: string, eventId: string, body: {
    title?: string;
    description?: string;
    date?: string;
    endDate?: string;
    allDay?: boolean;
    period?: number;
    duration?: number;
    eventType?: string;
  }) {
    return request<GroupEventResponse>(`/api/groups/${groupId}/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteEvent(groupId: string, eventId: string) {
    return request<DeletedResponse>(`/api/groups/${groupId}/events/${eventId}`, { method: "DELETE" });
  },
  // メンバー招待
  inviteMember(groupId: string, targetUserId: string) {
    return request<MessageResponse>(`/api/groups/${groupId}/invite`, {
      method: "POST",
      body: JSON.stringify({ userId: targetUserId }),
    });
  },
  // ロール変更
  updateMemberRole(groupId: string, memberId: string, role: string) {
    return request<MessageResponse>(`/api/groups/${groupId}/members/${memberId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
  },
  // 招待用ユーザ一覧
  searchUsers() {
    return request<{ users: Array<{ id: string; name: string; email: string }> }>("/api/groups/users/search");
  },
  // モジュール設定
  getModules(groupId: string) {
    return request<{ enabledModules: string[] }>(`/api/groups/${groupId}/modules`);
  },
  updateModules(groupId: string, enabledModules: string[]) {
    return request<{ enabledModules: string[] }>(`/api/groups/${groupId}/modules`, {
      method: "PUT",
      body: JSON.stringify({ enabledModules }),
    });
  },
};

// ─── MyPlan ──────────────────────────────────────────────────

export const myPlanApi = {
  list() {
    return request<MyPlanListResponse>("/api/myplans");
  },
  create(body: {
    name: string;
    patternType: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule: Record<string, Array<{ startTime: string; endTime: string; title: string }>>;
    groupId?: string;
  }) {
    return request<MyPlanResponse>("/api/myplans", {
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
    return request<MyPlanResponse>(`/api/myplans/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  remove(id: string) {
    return request<MessageResponse>(`/api/myplans/${id}`, { method: "DELETE" });
  },
  generateSchedule(id: string) {
    return request<{ generatedEvents: number }>(`/api/myplans/${id}/generate`, { method: "POST" });
  },
};

// ─── Smart Scheduler (汎用自動配置) ─────────────────────────

export const smartSchedulerApi = {
  getTasks(groupId: string) {
    return request<SchedulingTaskListResponse>(`/api/smart-scheduler/tasks/${groupId}`);
  },
  createTask(body: {
    groupId: string;
    title: string;
    duration?: number;
    priority?: number;
    preferredDays?: number[];
    preferredPeriods?: number[];
    instructorId?: string;
  }) {
    return request<SchedulingTaskResponse>("/api/smart-scheduler/tasks", {
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
    instructorId?: string | null;
  }) {
    return request<SchedulingTaskResponse>(`/api/smart-scheduler/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteTask(id: string) {
    return request<MessageResponse>(`/api/smart-scheduler/tasks/${id}`, { method: "DELETE" });
  },
  solve(groupId: string, options?: { considerHolidays?: boolean; considerBusinessDays?: boolean }) {
    return request<SolveResponse>(`/api/smart-scheduler/solve/${groupId}`, {
      method: "POST",
      body: options ? JSON.stringify(options) : undefined,
    });
  },
  confirm(resultId: string) {
    return request<ConfirmResponse>(`/api/smart-scheduler/confirm/${resultId}`, { method: "POST" });
  },
  getResults(groupId: string) {
    return request<SchedulingResultsResponse>(`/api/smart-scheduler/results/${groupId}`);
  },
  getAvailability(groupId: string) {
    return request<SchedulerAvailabilityResponse>(`/api/smart-scheduler/availability/${groupId}`);
  },
};

// ─── Holidays (休日管理) ─────────────────────────────────────

export const holidayApi = {
  /** 日本の祝日一覧 (計算ベース, DB不要) */
  getJapaneseHolidays(year: number) {
    return request<{ holidays: Array<{ date: string; name: string }>; year: number }>(`/api/holidays/japanese/${year}`);
  },
  /** 日本の祝日をDBに同期 */
  syncJapaneseHolidays(year?: number, groupId?: string) {
    return request<{ message: string; year: number; count: number }>("/api/holidays/japanese/sync", {
      method: "POST",
      body: JSON.stringify({ year, groupId }),
    });
  },
  /** 休日一覧取得 */
  getHolidays(params?: { groupId?: string; startDate?: string; endDate?: string }) {
    const query = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])}` : "";
    return request<HolidayListResponse>(`/api/holidays${query}`);
  },
  /** 休日追加 */
  createHoliday(body: {
    groupId?: string;
    name: string;
    date: string;
    endDate?: string;
    holidayType?: string;
    recurrence?: string;
  }) {
    return request<{ id: string; name: string; date: string }>("/api/holidays", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** 休日削除 */
  deleteHoliday(id: string) {
    return request<{ deleted: string }>(`/api/holidays/${id}`, { method: "DELETE" });
  },
  /** 指定日が休日かチェック */
  checkDate(date: string, groupId?: string) {
    const query = groupId ? `?groupId=${groupId}` : "";
    return request<{ date: string; isHoliday: boolean; isWeekend: boolean; isNationalHoliday: boolean }>(`/api/holidays/check/${date}${query}`);
  },
};

// ─── External API (APIクライアント管理) ──────────────────────

import type {
  ApiClientListResponse, ApiClientCreateResponse,
  ApiClientRegenerateResponse, ApiClientUpdateResponse,
} from "./api-types";

export const externalApiClient = {
  list() {
    return request<ApiClientListResponse>("/api/external/clients");
  },
  create(body: { name: string; scopes?: string[] }) {
    return request<ApiClientCreateResponse>("/api/external/clients", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  regenerate(id: string) {
    return request<ApiClientRegenerateResponse>(`/api/external/clients/${id}/regenerate`, {
      method: "POST",
    });
  },
  update(id: string, body: { name?: string; scopes?: string[]; isActive?: boolean }) {
    return request<ApiClientUpdateResponse>(`/api/external/clients/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  remove(id: string) {
    return request<MessageResponse>(`/api/external/clients/${id}`, {
      method: "DELETE",
    });
  },
  getDocs() {
    return request<Record<string, unknown>>("/api/external/docs");
  },
};

// ─── Reminders (リマインダー) ──────────────────────────────────

export const reminderApi = {
  /** リマインダー一覧取得 */
  list(status?: string) {
    const query = status ? `?status=${status}` : "";
    return request<ReminderListResponse>(`/api/reminders${query}`);
  },
  /** 構造化データで作成 */
  create(body: { title: string; description?: string; remindAt: string; repeatRule?: string }) {
    return request<ReminderResponse>("/api/reminders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** 自由テキストで作成 */
  parseAndCreate(text: string) {
    return request<ReminderParseResponse>("/api/reminders/parse", {
      method: "POST",
      body: JSON.stringify({ text, source: "web" }),
    });
  },
  /** 更新 */
  update(id: string, body: { title?: string; description?: string; remindAt?: string; repeatRule?: string; status?: string }) {
    return request<ReminderResponse>(`/api/reminders/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  /** 削除 */
  remove(id: string) {
    return request<{ deleted: string }>(`/api/reminders/${id}`, { method: "DELETE" });
  },
  /** 完了マーク */
  markDone(id: string) {
    return request<ReminderResponse>(`/api/reminders/${id}/done`, { method: "PATCH" });
  },
};

// ─── Integrations (外部サービス連携) ──────────────────────────

export const integrationsApi = {
  // --- Google Calendar Sync ---
  googleCalendar: {
    getStatus() {
      return request<{
        connected: boolean;
        hasWriteScope: boolean;
        syncEnabled: boolean;
        config: Record<string, unknown>;
      }>("/api/integrations/google-calendar/status");
    },
    enable(calendarId?: string) {
      return request<{ message: string }>("/api/integrations/google-calendar/enable", {
        method: "POST",
        body: JSON.stringify({ calendarId }),
      });
    },
    disable() {
      return request<{ message: string }>("/api/integrations/google-calendar/disable", {
        method: "POST",
      });
    },
    pushEvent(eventId: string) {
      return request<{ message: string; googleCalendarEventId: string }>(
        `/api/integrations/google-calendar/push/${eventId}`,
        { method: "POST" }
      );
    },
    pushAll() {
      return request<{ created: number; updated: number; errors: number; total: number }>(
        "/api/integrations/google-calendar/push-all",
        { method: "POST" }
      );
    },
    deleteEvent(eventId: string) {
      return request<{ message: string }>(
        `/api/integrations/google-calendar/push/${eventId}`,
        { method: "DELETE" }
      );
    },
    getLogs() {
      return request<{ logs: any[] }>("/api/integrations/google-calendar/logs");
    },
  },

  // --- Notion ---
  notion: {
    getStatus() {
      return request<{
        connected: boolean;
        databaseId: string | null;
        isActive: boolean;
      }>("/api/integrations/notion/status");
    },
    connect(token: string, databaseId?: string) {
      return request<{ message: string }>("/api/integrations/notion/connect", {
        method: "POST",
        body: JSON.stringify({ token, databaseId }),
      });
    },
    disconnect() {
      return request<{ message: string }>("/api/integrations/notion/disconnect", {
        method: "POST",
      });
    },
    listDatabases() {
      return request<{
        databases: Array<{ id: string; title: string; properties: string[] }>;
      }>("/api/integrations/notion/databases");
    },
    setDatabase(databaseId: string) {
      return request<{ message: string; databaseId: string }>(
        "/api/integrations/notion/database",
        { method: "PUT", body: JSON.stringify({ databaseId }) }
      );
    },
    createDatabase(parentPageId: string) {
      return request<{ message: string; databaseId: string }>(
        "/api/integrations/notion/database/create",
        { method: "POST", body: JSON.stringify({ parentPageId }) }
      );
    },
    getPages() {
      return request<{ pages: any[] }>("/api/integrations/notion/pages");
    },
    createPage(properties: Record<string, unknown>) {
      return request<{ message: string; pageId: string }>(
        "/api/integrations/notion/pages",
        { method: "POST", body: JSON.stringify({ properties }) }
      );
    },
    updatePage(pageId: string, properties: Record<string, unknown>) {
      return request<{ message: string }>(
        `/api/integrations/notion/pages/${pageId}`,
        { method: "PUT", body: JSON.stringify({ properties }) }
      );
    },
    deletePage(pageId: string) {
      return request<{ message: string }>(
        `/api/integrations/notion/pages/${pageId}`,
        { method: "DELETE" }
      );
    },
    pushEvent(eventId: string) {
      return request<{ message: string; notionPageId: string }>(
        `/api/integrations/notion/sync/push/${eventId}`,
        { method: "POST" }
      );
    },
    pushAll() {
      return request<{ created: number; updated: number; errors: number; total: number }>(
        "/api/integrations/notion/sync/push-all",
        { method: "POST" }
      );
    },
    getLogs() {
      return request<{ logs: any[] }>("/api/integrations/notion/sync/logs");
    },
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
    return request<VotingEventCreateResponse>("/api/voting/events", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listEvents() {
    return request<VotingEventListResponse>("/api/voting/events");
  },
  getEvent(eventId: string) {
    return request<VotingEventDetailResponse>(`/api/voting/events/${eventId}`);
  },
  submitVotes(
    eventId: string,
    votes: { candidateId: string; answer: string; comment?: string }[]
  ) {
    return request<VotingSubmitResponse>(`/api/voting/events/${eventId}/votes`, {
      method: "POST",
      body: JSON.stringify({ votes }),
    });
  },
  autoReply(eventId: string) {
    return request<VotingAutoReplyResponse>(`/api/voting/events/${eventId}/auto-reply`, {
      method: "POST",
    });
  },
  updateEvent(
    eventId: string,
    body: { status?: string; title?: string; description?: string; deadline?: string }
  ) {
    return request<VotingUpdateResponse>(`/api/voting/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteEvent(eventId: string) {
    return request<VotingUpdateResponse>(`/api/voting/events/${eventId}`, {
      method: "DELETE",
    });
  },
};

// ─── Setup (初回セットアップ: 認証不要) ────────────────────────

export const setupApi = {
  getStatus() {
    return request<{
      needsSetup: boolean;
      infisicalConfigured: boolean;
      ssmConfigured: boolean;
      providerType: string;
      setupSkipped: boolean;
    }>("/api/setup/status");
  },
  testConnection(body: {
    siteUrl?: string;
    projectId: string;
    environment?: string;
    authMethod: "universal" | "token";
    clientId?: string;
    clientSecret?: string;
    token?: string;
  }) {
    return request<{ success: boolean; message: string; secretCount?: number }>(
      "/api/setup/test-connection",
      { method: "POST", body: JSON.stringify(body) }
    );
  },
  testSsm(body: { region: string; pathPrefix: string }) {
    return request<{ success: boolean; message: string; secretCount?: number }>(
      "/api/setup/test-ssm",
      { method: "POST", body: JSON.stringify(body) }
    );
  },
  saveInfisical(body: {
    siteUrl?: string;
    projectId: string;
    environment?: string;
    authMethod: "universal" | "token";
    clientId?: string;
    clientSecret?: string;
    token?: string;
  }) {
    return request<{ success: boolean; message: string; infisicalEnabled: boolean }>(
      "/api/setup/infisical",
      { method: "POST", body: JSON.stringify(body) }
    );
  },
  saveSsm(body: { region: string; pathPrefix: string }) {
    return request<{ success: boolean; message: string; ssmEnabled: boolean; providerType: string }>(
      "/api/setup/ssm",
      { method: "POST", body: JSON.stringify(body) }
    );
  },
  saveSsmSecrets(body: { region: string; pathPrefix: string; secrets: Record<string, string> }) {
    return request<{ success: boolean; message: string; written: number; errors: string[] }>(
      "/api/setup/ssm-secrets",
      { method: "POST", body: JSON.stringify(body) }
    );
  },
  skip() {
    return request<{ success: boolean; message: string }>("/api/setup/skip", {
      method: "POST",
    });
  },
  envCheck() {
    return request<{
      hasEnvFile: boolean;
      hasInfisicalConfig: boolean;
      hasSsmConfig: boolean;
      envVars: Record<string, boolean>;
    }>("/api/setup/env-check");
  },
};

// ─── M3 MACHINA (タスク自動生成) ─────────────────────────────

export const machinaApi = {
  // Tasks
  getTasks(groupId: string, status?: string) {
    const params = status ? `?status=${status}` : "";
    return request<MachinaTaskListResponse>(`/api/machina/groups/${groupId}/tasks${params}`);
  },
  getTask(groupId: string, taskId: string) {
    return request<MachinaTaskDetailResponse>(`/api/machina/groups/${groupId}/tasks/${taskId}`);
  },
  createTask(groupId: string, data: {
    title: string;
    description?: string;
    priority?: string;
    assigneeId?: string;
    dueDate?: string;
  }) {
    return request<{ id: string; message: string }>(`/api/machina/groups/${groupId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateTask(groupId: string, taskId: string, data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    isCriticalPath?: boolean;
  }) {
    return request<{ message: string }>(`/api/machina/groups/${groupId}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  deleteTask(groupId: string, taskId: string) {
    return request<{ deleted: string }>(`/api/machina/groups/${groupId}/tasks/${taskId}`, {
      method: "DELETE",
    });
  },
  getTaskLogs(groupId: string, taskId: string) {
    return request<MachinaTaskLogListResponse>(`/api/machina/groups/${groupId}/tasks/${taskId}/logs`);
  },
  relayTask(groupId: string, taskId: string) {
    return request<{ message: string; pmTaskId?: string }>(`/api/machina/groups/${groupId}/tasks/${taskId}/relay`, {
      method: "POST",
    });
  },

  // Channel Monitors
  getMonitors(groupId: string) {
    return request<MachinaMonitorListResponse>(`/api/machina/groups/${groupId}/monitors`);
  },
  createMonitor(groupId: string, data: {
    platform: string;
    channelId: string;
    channelName: string;
    webhookEndpointId?: string;
  }) {
    return request<{ id: string; message: string }>(`/api/machina/groups/${groupId}/monitors`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateMonitor(groupId: string, monitorId: string, data: {
    channelName?: string;
    isActive?: boolean;
    webhookEndpointId?: string | null;
  }) {
    return request<{ message: string }>(`/api/machina/groups/${groupId}/monitors/${monitorId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  deleteMonitor(groupId: string, monitorId: string) {
    return request<{ deleted: string }>(`/api/machina/groups/${groupId}/monitors/${monitorId}`, {
      method: "DELETE",
    });
  },

  // Analysis
  analyzeText(text: string, platform?: string) {
    return request<MachinaAnalysisResponse>("/api/machina/analyze", {
      method: "POST",
      body: JSON.stringify({ text, platform }),
    });
  },

  // Status
  getStatus() {
    return request<MachinaStatusResponse>("/api/machina/status");
  },
};

// ─── PM (Project Management) ──────────────────────────────

export const pmApi = {
  // Projects
  listProjects() {
    return request<{ projects: PMProject[] }>("/api/pm/projects");
  },
  getProject(id: string) {
    return request<PMProject>(`/api/pm/projects/${id}`);
  },
  createProject(data: { name: string; source: string; sourceConfig: Record<string, string>; syncIntervalMinutes?: number }) {
    return request<PMProject>("/api/pm/projects", { method: "POST", body: JSON.stringify(data) });
  },
  updateProject(id: string, data: { name?: string; sourceConfig?: Record<string, string>; syncIntervalMinutes?: number }) {
    return request<PMProject>(`/api/pm/projects/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  deleteProject(id: string) {
    return request<{ deleted: string }>(`/api/pm/projects/${id}`, { method: "DELETE" });
  },

  // Sync
  triggerSync(projectId: string) {
    return request<PMSyncResult>(`/api/pm/projects/${projectId}/sync`, { method: "POST" });
  },
  getSyncStatus(projectId: string) {
    return request<{ projectId: string; lastSyncedAt: string | null; status: string }>(`/api/pm/projects/${projectId}/sync/status`);
  },

  // Tasks
  listTasks(projectId: string) {
    return request<{ tasks: PMTask[] }>(`/api/pm/projects/${projectId}/tasks`);
  },
  getTask(taskId: string) {
    return request<PMTask>(`/api/pm/tasks/${taskId}`);
  },
  updateTask(taskId: string, data: Partial<Pick<PMTask, "title" | "description" | "status" | "priority" | "assignees" | "labels" | "dueDate" | "estimatedHours" | "blockedBy">>) {
    return request<PMTask>(`/api/pm/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) });
  },
  getTaskHistory(taskId: string) {
    return request<{ history: PMTaskSnapshot[] }>(`/api/pm/tasks/${taskId}/history`);
  },

  // Validation
  validateTask(taskId: string) {
    return request<PMValidationResult>(`/api/pm/tasks/${taskId}/validate`, { method: "POST" });
  },
  getValidation(taskId: string) {
    return request<PMValidationResult>(`/api/pm/tasks/${taskId}/validation`);
  },

  // Conflicts
  listConflicts(projectId: string) {
    return request<{ conflicts: PMConflict[] }>(`/api/pm/projects/${projectId}/conflicts`);
  },
  resolveConflict(conflictId: string, data: { resolution: string; resolvedData?: Record<string, unknown> }) {
    return request<{ message: string }>(`/api/pm/conflicts/${conflictId}/resolve`, { method: "POST", body: JSON.stringify(data) });
  },

  // Reminders
  getReminders(projectId: string) {
    return request<PMReminderSettings>(`/api/pm/projects/${projectId}/reminders`);
  },
  updateReminders(projectId: string, data: PMReminderSettings) {
    return request<PMReminderSettings>(`/api/pm/projects/${projectId}/reminders`, { method: "PUT", body: JSON.stringify(data) });
  },
  testReminders(projectId: string) {
    return request<PMReminderTestResult>(`/api/pm/projects/${projectId}/reminders/test`, { method: "POST" });
  },

  // Analytics
  getProgress(projectId: string) {
    return request<PMProgressReport>(`/api/pm/projects/${projectId}/analytics/progress`);
  },
  getCriticalPath(projectId: string) {
    return request<PMCriticalPathResult>(`/api/pm/projects/${projectId}/analytics/critical-path`);
  },
  getDecomposition(projectId: string) {
    return request<{ recommendations: PMDecompositionRecommendation[] }>(`/api/pm/projects/${projectId}/analytics/decomposition`);
  },
  getGompertz(projectId: string) {
    return request<PMGompertzReport>(`/api/pm/projects/${projectId}/analytics/gompertz`);
  },
  getFullReport(projectId: string) {
    return request<PMFullReport>(`/api/pm/projects/${projectId}/analytics/report`);
  },
};
