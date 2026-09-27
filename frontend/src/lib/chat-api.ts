import { request } from "./api";
export interface ChatConnection {
  platform: "discord" | "slack"; workspaceId: string; backlogChannelId: string; categoryId?: string;
  archiveCategoryId?: string; tokenRef?: string; dailyAt: string; timezone: string; enabled: boolean;
  joinDiscussion: boolean; revision: number;
}
export interface ChatIntake {
  id: string; revision: number; state: string; content: string; sourceDeleted: boolean; taskId: string | null; reviewError: string | null;
  review: { title: string; purpose: string; change: string; acceptance: string[]; questions: string[]; concerns: string[] } | null;
}
export interface ChatState {
  mode: string; canManage: boolean; diConfigured: boolean; connections: ChatConnection[]; intakes: ChatIntake[];
  channels: { id: string; parentId: string | null }[];
  surfaces: { sprintId: string; channelId: string | null; state: string; logCaughtUp: boolean }[];
  discussionSettings: { channelId: string; enabled: boolean; revision: number }[];
  health: { error: string | null; at: string }[]; discussionHealth: { error: string | null; at: string }[];
  outbox: { id: string; state: string; kind: string; error: string | null }[];
}
export interface ChatLog {
  messages: { id: string; content: string; deleted: boolean; bot: boolean; occurredAt: string; editedAt: string | null; url: string; attachments: { name: string; url: string }[] }[];
  total: number; cursor: { complete: boolean; at: string } | null;
}
export const chatBase = (team: string): string => `/api/teams/${encodeURIComponent(team)}/chat`;
export const chatApi = {
  registerCommands: (team: string): Promise<{ registered: boolean; interactionPath: string }> => request(`${chatBase(team)}/commands`, { method: "POST" }),
  state: (team: string, signal?: AbortSignal): Promise<ChatState> => request(`${chatBase(team)}/state`, { signal }),
  logs: (team: string, channel: string, offset: number, q: string, signal?: AbortSignal): Promise<ChatLog> => request(`${chatBase(team)}/logs/${encodeURIComponent(channel)}?offset=${offset}&q=${encodeURIComponent(q)}`, { signal }),
};
