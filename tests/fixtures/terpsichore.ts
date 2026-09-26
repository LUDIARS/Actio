import type { BacklogTask, Sprint } from "../../modules/task/planning/contracts.js";
import { guidanceInput, type GuidanceInput } from "@ludiars/terpsichore";

export const now = new Date("2026-09-26T12:00:00Z");
export function task(id: string, patch: Partial<BacklogTask> = {}): BacklogTask {
  return { id, title: id, description: "利用者が保存内容を確認できる", requirements: "保存後に再表示して一致する", status: "open", priority: "medium",
    assigneeId: "reviewer", projectId: "At", deadline: null, estimatedMinutes: 30, sprintId: null, category: null, groupId: null,
    position: 0, fingerprint: `${id}-v1`, updatedAt: now.getTime() / 1000, executorType: "ai", blockedBy: [], ...patch };
}
export function input(patch: Partial<GuidanceInput> = {}): GuidanceInput {
  return guidanceInput.parse({ projectId: "At", goal: { audience: "利用者", outcome: "保存して再利用できる", successSignal: "再表示で内容が一致する" },
    checkpoints: [], definitions: [], deferred: [], ...patch });
}
export function sprint(patch: Partial<Sprint> = {}): Sprint {
  return { id: "sprint", teamId: "team", name: "Sprint", goal: null, startsOn: "2026-09-20", endsOn: "2026-09-26", originalEndsOn: "2026-09-26",
    bufferEndsOn: "2026-09-28", cadenceDays: 7, capacityMinutes: 700, status: "active", revision: 0, ...patch };
}
