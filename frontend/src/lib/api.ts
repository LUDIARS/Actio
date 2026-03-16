import { API_BASE } from "./constants";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add user context header
  const userId = localStorage.getItem("userId") || "user-1";
  headers["X-User-Id"] = userId;

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── M1 ─────────────────────────────────────────────────────

export const m1 = {
  importInstructors(file: File) {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}/api/m1/instructors/import`, {
      method: "POST",
      body: form,
    }).then((r) => r.json());
  },
  importRooms(file: File) {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}/api/m1/rooms/import`, {
      method: "POST",
      body: form,
    }).then((r) => r.json());
  },
  importCurriculum(file: File) {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}/api/m1/curriculum/import`, {
      method: "POST",
      body: form,
    }).then((r) => r.json());
  },
  generate(mode: "pack" | "spread") {
    return request<any>("/api/m1/schedule/generate", {
      method: "POST",
      body: JSON.stringify({ mode }),
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
