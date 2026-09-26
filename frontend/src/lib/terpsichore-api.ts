import { request } from "./api";
import type { GuidanceInput, GuidanceReport, JudgmentCard } from "@ludiars/terpsichore/types";
import type { ExecutionPreview, ExecutionRecord, ExecutionStatus, ExecutionTemplate } from "@ludiars/terpsichore/types";
export type { GuidanceInput, GuidanceReport, JudgmentCard };
export type { ExecutionPreview, ExecutionStatus, ExecutionTemplate };
export interface GuidancePlan { revision: number; input: GuidanceInput; updatedAt: string }
const base = (team: string) => `/teams/${encodeURIComponent(team)}/planning/terpsichore`;
export const terpsichoreApi = {
  load: (team: string, projectId: string, sprintId: string) => {
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    if (sprintId) query.set("sprintId", sprintId);
    return request<{ plan: GuidancePlan | null; input: GuidanceInput; report: GuidanceReport | null; warning: string | null }>(`${base(team)}/plan?${query}`);
  },
  assess: (team: string, input: GuidanceInput) => request<{ report: GuidanceReport }>(`${base(team)}/assess`, { method: "POST", body: JSON.stringify(input) }),
  save: (team: string, input: GuidanceInput, revision: number, sourceFingerprint: string) => request<{ plan: GuidancePlan; report: GuidanceReport }>(`${base(team)}/plan`, { method: "PUT", body: JSON.stringify({ input, revision, sourceFingerprint }) }),
  advice: (team: string, input: GuidanceInput) => request<{ cards: JudgmentCard[] }>(`${base(team)}/advice`, { method: "POST", body: JSON.stringify(input) }),
  templates: (team: string) => request<{ templates: ExecutionTemplate[] }>(`${base(team)}/execution/templates`),
  executionPreview: (team: string, projectId: string) => request<ExecutionPreview>(`${base(team)}/execution/preview?${new URLSearchParams({ projectId })}`),
  executionStatus: (team: string, projectId: string) => request<ExecutionStatus>(`${base(team)}/execution?${new URLSearchParams({ projectId })}`),
  execute: (team: string, projectId: string, callName: string, preview: ExecutionPreview) => request<{ execution: ExecutionRecord }>(`${base(team)}/execution`, {
    method: "POST", body: JSON.stringify({ projectId, callName, planRevision: preview.planRevision, sourceFingerprint: preview.sourceFingerprint }),
  }),
};
