// @spec スクラムマスターの役割と権限
import { request } from "./api";

export interface ScrumMasterView {
  assignment: { holder: string; delegate: "local-session" | "api-client"; assignedBy: string; assignedAt: string } | null;
  canManage: boolean;
}
const base = (team: string): string => `/api/teams/${encodeURIComponent(team)}/planning/scrum-master`;

export const scrumMasterApi = {
  read: (team: string, signal?: AbortSignal): Promise<ScrumMasterView> => request(base(team), { signal }),
  /** `clientId` が null なら、Actio と同じ PC の AI セッションが役割を担う。 */
  assign: (team: string, clientId: string | null): Promise<{ ok: true }> =>
    request(base(team), { method: "PUT", body: JSON.stringify({ clientId }) }),
  remove: (team: string): Promise<{ ok: true }> => request(base(team), { method: "DELETE" }),
};
