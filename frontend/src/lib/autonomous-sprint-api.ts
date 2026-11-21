import { request } from "./api";

interface AutonomousSprintRun {
  sprintId: string;
  status: "running" | "paused";
  revision: number;
  cycle: number;
  nextSprintId: string | null;
  claimId: string | null;
  warning: string | null;
  progress: { total: number; done: number; cancelled: number; blocked: number; stalledTaskIds: string[] };
}
const base = (team: string): string => `/api/teams/${encodeURIComponent(team)}/planning/autonomous-sprint`;
const post = (path: string, input: object): Promise<{ ok: true }> =>
  request(path, { method: "POST", body: JSON.stringify(input) });

export const autonomousSprintApi = {
  read: (team: string, signal?: AbortSignal): Promise<{ run: AutonomousSprintRun | null; canManage: boolean }> =>
    request(base(team), { signal }),
  enroll: (team: string, sprintId: string, clientId: string) => post(base(team), { sprintId, clientId }),
  manage: (team: string, sprintId: string, action: "pause" | "reconcile" | "release", expectedRevision: number, reason: string) =>
    post(`${base(team)}/${encodeURIComponent(sprintId)}/${action}`, { expectedRevision, reason }),
};
