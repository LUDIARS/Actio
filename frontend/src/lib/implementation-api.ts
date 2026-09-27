import { request } from "./api";
export interface ImplementationReview {
  kind: "spec" | "scenario"; id: string; title: string; specificationRevision: string; fingerprint: string;
  state: "unregistered" | "in_progress" | "returned" | "specification_changed" | "awaiting_confirmation" | "completed";
  tasks: { id: string; title: string; status: string; isBacklog: boolean }[];
  confirmation: { actorId: string; confirmedAt: string; note: string } | null;
}
export const implementationLabels: Record<ImplementationReview["state"], string> = {
  unregistered: "タスク未登録", in_progress: "実装タスク未完了", returned: "差し戻し・追加作業あり",
  specification_changed: "仕様変更・再確認が必要", awaiting_confirmation: "タスク完了・人間確認待ち", completed: "人間確認済み・完了",
};
const base = (team: string, project: string) => `/api/teams/${encodeURIComponent(team)}/planning/praeforma/projects/${encodeURIComponent(project)}/implementation`;
export const implementationApi = {
  load: (team: string, project: string) => request<{ items: ImplementationReview[]; canConfirm: boolean }>(base(team, project)),
  change: (team: string, project: string, subject: ImplementationReview, input: Record<string, unknown>) =>
    request<{ item: ImplementationReview }>(`${base(team, project)}/${subject.kind}/${encodeURIComponent(subject.id)}`, {
      method: "POST", body: JSON.stringify({ ...input, fingerprint: subject.fingerprint }),
    }),
};
