import { request } from "./api";

export interface PlanningTask {
  id: string; title: string; description: string | null; requirements: string | null; status: string;
  priority: string; assigneeId: string | null; projectId: string | null; deadline: number | null;
  estimatedMinutes: number | null; sprintId: string | null; category: string | null;
  groupId: string | null; position: number; fingerprint: string;
  executorType: string; aiExecutor: string | null; isCriticalPath: boolean | number;
  slackDays: number | null; criticalPathError: string | null;
}
export interface TeamProject { code: string; name: string }
export interface CurrentSprintView {
  tasks: { id: string }[];
  current_sprint: { id: string; name: string; startsOn: string; endsOn: string } | null;
}
export interface Sprint {
  id: string; name: string; goal: string | null; startsOn: string; endsOn: string; originalEndsOn: string;
  cadenceDays: number; bufferEndsOn: string; capacityMinutes: number | null;
  status: "planning" | "active" | "closed"; revision: number;
  impact: { estimatedMinutes: number; unknownEstimates: number; projectedEndsOn: string | null;
    state: "unknown" | "within" | "buffer" | "reschedule"; overdueTaskIds: string[] };
}
export interface PlanningData { tasks: PlanningTask[]; sprints: Sprint[]; groups: { id: string; name: string; reason: string }[]; suggestions: { ids: string[]; reason: string }[] }
export interface Team { id: string; name: string | null; role: string }
/** kind=ai は Cc の委託テンプレートを登録した AI メンバー (userId は `ai:<callName>`)。 */
export interface TeamMember { userId: string; role: string; kind: "human" | "ai"; callName: string | null }
export interface PfSpec { id: string; code: string; title: string; description: string | null; version: number; status: string; preconditions?: string[]; postconditions?: string[] }
export interface PfDetail { spec: PfSpec; acceptance: { text: string; enabled: boolean }[]; fingerprint: string;
  existingTask: { id: string; fingerprint: string; requirements: string | null; estimatedMinutes: number | null } | null }
const base = (team: string) => `/api/teams/${encodeURIComponent(team)}/planning`;
const specBase = (team: string, project: string) => `${base(team)}/praeforma/projects/${encodeURIComponent(project)}/specs`;
export const planningApi = {
  teams: () => request<{ teams: Team[] }>("/api/teams"),
  members: (team: string) => request<{ members: TeamMember[] }>(`/api/teams/${encodeURIComponent(team)}/members`),
  addAiMember: (team: string, callName: string) => request<{ member: TeamMember }>(`/api/teams/${encodeURIComponent(team)}/ai-members/${encodeURIComponent(callName)}`, { method: "PUT" }),
  removeAiMember: (team: string, callName: string) => request<{ ok: boolean }>(`/api/teams/${encodeURIComponent(team)}/ai-members/${encodeURIComponent(callName)}`, { method: "DELETE" }),
  load: (team: string) => request<PlanningData>(base(team)),
  currentView: (team: string) => request<CurrentSprintView>(`/api/tasks?team_id=${encodeURIComponent(team)}&view=current_sprint`),
  teamProjects: (team: string) => request<{ projects: TeamProject[] }>(`/api/teams/${encodeURIComponent(team)}/projects`),
  mutate: (team: string, path: string, body: unknown, method = "POST") => request(base(team) + path, { method, body: JSON.stringify(body) }),
  history: (team: string, id: string) => request<{ changes: { kind: string; reason: string; actorId: string; createdAt: string; beforeJson: string; afterJson: string }[] }>(`${base(team)}/sprints/${id}/history`),
  projects: (team: string) => request<{ items: { id: string; name: string }[] }>(`${base(team)}/praeforma/projects`),
  specs: (team: string, project: string) => request<{ items: PfSpec[] }>(specBase(team, project)),
  spec: (team: string, project: string, id: string) => request<PfDetail>(`${specBase(team, project)}/${encodeURIComponent(id)}`),
  import: (team: string, project: string, id: string, input: unknown) => request<{ id: string; created: boolean }>(`${specBase(team, project)}/${encodeURIComponent(id)}/backlog`, { method: "POST", body: JSON.stringify(input) }),
};
