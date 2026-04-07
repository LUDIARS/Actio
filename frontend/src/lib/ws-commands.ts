/**
 * WS コマンドヘルパー
 *
 * 各モジュールの破壊的操作を WS module_request としてラップする。
 * 読み取り操作は引き続き REST API (api.ts) を使用する。
 */

import { wsClient } from "./ws-client";
import type {
  PersonalEvent, Plan,
  GroupCreateResponse, GroupEvent,
  MyPlanResponse,
  VotingEventCreateResponse, VotingSubmitResponse, VotingAutoReplyResponse, VotingUpdateResponse,
  Reservation,
  PMProject, PMTask, PMSyncResult, PMConflict, PMValidationResult,
  MessageResponse,
  UserRoleUpdateResponse,
} from "./api-types";

// ── 汎用 ────────────────────────────────────────────

export async function wsCommand<T = unknown>(
  module: string,
  action: string,
  payload?: unknown,
): Promise<T> {
  return wsClient.sendCommand<T>(module, action, payload);
}

// ── Calendar ────────────────────────────────────────

export const wsCalendar = {
  createEvent: (data: {
    title: string;
    description?: string;
    day: number;
    period: number;
    duration?: number;
    startTime?: string;
    endTime?: string;
    eventType?: string;
    isPrivate?: boolean;
  }) => wsCommand<{ event: PersonalEvent }>("calendar", "create_event", data),

  updateEvent: (data: {
    id: string;
    title?: string;
    description?: string;
    day?: number;
    period?: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }) => wsCommand<{ event: PersonalEvent }>("calendar", "update_event", data),

  deleteEvent: (id: string) =>
    wsCommand<{ deleted: string }>("calendar", "delete_event", { id }),

  createPlan: (data: {
    name: string;
    description?: string;
    days: number[];
    startPeriod: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }) => wsCommand<{ plan: Plan; generatedEvents: number }>("calendar", "create_plan", data),

  updatePlan: (data: {
    id: string;
    name?: string;
    description?: string;
    days?: number[];
    startPeriod?: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
    isActive?: boolean;
  }) => wsCommand<{ plan: Plan }>("calendar", "update_plan", data),

  deletePlan: (id: string) =>
    wsCommand<{ deleted: string }>("calendar", "delete_plan", { id }),

  regeneratePlan: (id: string) =>
    wsCommand<{ generatedEvents: number }>("calendar", "regenerate_plan", { id }),

  disconnectGoogle: () =>
    wsCommand<MessageResponse>("calendar", "disconnect_google"),
};

// ── Group ───────────────────────────────────────────

export const wsGroup = {
  create: (data: { name: string; description?: string }) =>
    wsCommand<GroupCreateResponse>("group", "create", data),

  join: (groupId: string) =>
    wsCommand<MessageResponse>("group", "join", { groupId }),

  leave: (groupId: string) =>
    wsCommand<MessageResponse>("group", "leave", { groupId }),

  invite: (groupId: string, userId: string) =>
    wsCommand<MessageResponse>("group", "invite", { groupId, userId }),

  updateMemberRole: (groupId: string, memberId: string, role: string) =>
    wsCommand<MessageResponse>("group", "update_member_role", { groupId, memberId, role }),

  createSchedule: (groupId: string, data: {
    title: string;
    day: number;
    period: number;
    duration?: number;
    scheduleType?: string;
    date?: string;
  }) => wsCommand<{ schedule: unknown }>("group", "create_schedule", { groupId, ...data }),

  createEvent: (groupId: string, data: {
    title: string;
    description?: string;
    date: string;
    endDate?: string;
    allDay?: boolean;
    period?: number;
    duration?: number;
    eventType?: string;
  }) => wsCommand<{ event: GroupEvent }>("group", "create_event", { groupId, ...data }),

  updateEvent: (groupId: string, eventId: string, data: {
    title?: string;
    description?: string;
    date?: string;
    endDate?: string;
    allDay?: boolean;
    period?: number;
    duration?: number;
    eventType?: string;
  }) => wsCommand<{ event: GroupEvent }>("group", "update_event", { groupId, eventId, ...data }),

  deleteEvent: (groupId: string, eventId: string) =>
    wsCommand<{ deleted: string }>("group", "delete_event", { groupId, eventId }),

  updateModules: (groupId: string, enabledModules: string[]) =>
    wsCommand<MessageResponse>("group", "update_modules", { groupId, enabledModules }),
};

// ── MyPlan ──────────────────────────────────────────

export const wsMyPlan = {
  create: (data: {
    name: string;
    patternType?: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule?: Record<string, unknown>;
    groupId?: string;
  }) => wsCommand<MyPlanResponse>("myplan", "create", data),

  update: (data: {
    id: string;
    name?: string;
    patternType?: string;
    validFrom?: string;
    validUntil?: string;
    weeklySchedule?: Record<string, unknown>;
    isActive?: boolean;
  }) => wsCommand<MyPlanResponse>("myplan", "update", data),

  delete: (id: string) =>
    wsCommand<{ deleted: string }>("myplan", "delete", { id }),

  generate: (id: string) =>
    wsCommand<{ generatedEvents: number }>("myplan", "generate", { id }),
};

// ── Voting ──────────────────────────────────────────

export const wsVoting = {
  createEvent: (data: {
    title: string;
    description?: string;
    deadline?: string;
    candidates: string[];
  }) => wsCommand<VotingEventCreateResponse>("voting", "create_event", data),

  submitVotes: (eventId: string, votes: Array<{
    candidateId: string;
    answer: string;
    comment?: string;
  }>) => wsCommand<VotingSubmitResponse>("voting", "submit_votes", { eventId, votes }),

  autoReply: (eventId: string) =>
    wsCommand<VotingAutoReplyResponse>("voting", "auto_reply", { eventId }),

  updateEvent: (eventId: string, data: {
    status?: string;
    title?: string;
    description?: string;
    deadline?: string;
  }) => wsCommand<VotingUpdateResponse>("voting", "update_event", { eventId, ...data }),

  deleteEvent: (eventId: string) =>
    wsCommand<{ deleted: string }>("voting", "delete_event", { eventId }),
};

// ── Facility Booking ────────────────────────────────

export const wsFacility = {
  createReservation: (data: {
    title: string;
    roomId: string;
    day: number;
    period: number;
    participants?: string[];
    participantGroupIds?: string[];
    groupId?: string;
    note?: string;
  }) => wsCommand<{ reservation: Reservation }>("facility", "create_reservation", data),

  updateReservation: (data: {
    id: string;
    title?: string;
    day?: number;
    period?: number;
    roomId?: string;
    participants?: string[];
    note?: string;
    version: number;
  }) => wsCommand<{ reservation: Reservation }>("facility", "update_reservation", data),

  cancelReservation: (id: string) =>
    wsCommand<MessageResponse>("facility", "cancel_reservation", { id }),
};

// ── PM (Project Management) ─────────────────────────

export const wsPM = {
  createProject: (data: {
    name: string;
    source: string;
    sourceConfig: Record<string, unknown>;
    syncIntervalMinutes?: number;
  }) => wsCommand<{ project: PMProject }>("pm", "create_project", data),

  updateProject: (projectId: string, data: {
    name?: string;
    sourceConfig?: Record<string, unknown>;
    syncIntervalMinutes?: number;
  }) => wsCommand<{ project: PMProject }>("pm", "update_project", { projectId, ...data }),

  deleteProject: (projectId: string) =>
    wsCommand<{ deleted: string }>("pm", "delete_project", { projectId }),

  sync: (projectId: string) =>
    wsCommand<PMSyncResult>("pm", "sync", { projectId }),

  updateTask: (taskId: string, data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignees?: string[];
    labels?: string[];
    dueDate?: string;
    estimatedHours?: number;
    blockedBy?: string[];
  }) => wsCommand<{ task: PMTask }>("pm", "update_task", { taskId, ...data }),

  resolveConflict: (conflictId: string, resolution: string, resolvedData?: unknown) =>
    wsCommand<{ conflict: PMConflict }>("pm", "resolve_conflict", { conflictId, resolution, resolvedData }),

  validateTask: (taskId: string) =>
    wsCommand<{ validation: PMValidationResult }>("pm", "validate_task", { taskId }),
};

// ── Admin ───────────────────────────────────────────

export const wsAdmin = {
  updateSettings: (settings: Record<string, string>) =>
    wsCommand<MessageResponse>("admin", "update_settings", { settings }),

  updateUserRole: (userId: string, role: string) =>
    wsCommand<UserRoleUpdateResponse>("admin", "update_user_role", { userId, role }),
};
