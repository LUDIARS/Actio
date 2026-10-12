import { describe, expect, it } from "vitest";
import type { SprintPhaseSnapshot } from "@ludiars/terpsichore";
import { dialogueSummary, humanMarks, taskBullet } from "../../modules/task/sprint-gates/dialogue-summary.js";

type Task = SprintPhaseSnapshot["tasks"][number];
const sprint = { id: "sprint-1", teamId: "team", name: "Sprint 1", goal: "ゴール", startsOn: "2026-10-12", endsOn: "2026-10-25", originalEndsOn: "2026-10-25", bufferEndsOn: "2026-10-27", cadenceDays: 14, status: "planning" as const, capacityMinutes: null, revision: 5 };
function task(id: string, title: string, projectId: string | null, status: Task["status"] = "open"): Task {
    return { id, title, description: null, requirements: null, status, priority: "medium", assigneeId: "leader", projectId, deadline: null, estimatedMinutes: null, sprintId: sprint.id, category: null, groupId: null, position: 0, fingerprint: "f" + id };
}
function snapshot(tasks: Task[], extra: Partial<SprintPhaseSnapshot> = {}): SprintPhaseSnapshot {
    return { sprint, tasks, complete: true, retrospective: "", nextPlan: null, ...extra };
}

describe("sprint dialogue summary", () => {
    it("lists only the sprint tasks as bullets without ids", () => {
        const text = dialogueSummary(snapshot([
            task("aecadfd3-00c3-4e1f-b71d-514b81d5ee32", "WebGL 描画を Pictor-WASM へ段階移行", "Lw"),
            task("9c8180df-3286-49cd-a596-b924d5fb2572", "CMake の build/test を CI で回す", "Ln", "in_progress"),
        ]));
        expect(text).toBe("- WebGL 描画を Pictor-WASM へ段階移行 (Lw・未着手)\n- CMake の build/test を CI で回す (Ln・進行中)");
        expect(text).not.toContain("aecadfd3");
        expect(text).not.toContain("振り返り");
        expect(text).not.toContain("次計画");
    });
    it("shortens long titles and omits a missing project", () => {
        expect(taskBullet(task("a", "あ".repeat(100), null, "done"))).toBe(`- ${"あ".repeat(79)}… (完了)`);
    });
    it("adds the retrospective and the next sprint tasks only when present", () => {
        const next = { sprint: { ...sprint, id: "sprint-2", name: "Sprint 2" }, tasks: [task("b", "次の作業", "Lw")], complete: true };
        const text = dialogueSummary(snapshot([task("a", "今の作業", "Lw", "done")], { retrospective: "  良かった  ", nextPlan: next }));
        expect(text).toBe("- 今の作業 (Lw・完了)\n\n振り返り:\n良かった\n\n次スプリント Sprint 2 のタスク:\n- 次の作業 (Lw・未着手)");
    });
    it("emphasizes tasks that need a human to work or confirm", () => {
        const human = { ...task("h", "QUIC realtime の本番起動", "Ll"), executorType: "human" };
        const review = { ...task("r", "動作確認", "Lw"), executorType: "ai", category: "確認作業" };
        const both = { ...task("b", "実機で疎通確認", "Ln"), executorType: "human", category: "確認作業" };
        const ai = { ...task("a", "CMake CI", "Ln"), executorType: "ai", category: "実装" };
        expect(humanMarks(human)).toEqual(["人の作業"]);
        expect(humanMarks(ai)).toEqual([]);
        expect(dialogueSummary(snapshot([human, review, both, ai]))).toBe([
            "- **【人の作業】QUIC realtime の本番起動** (Ll・未着手)",
            "- **【確認】動作確認** (Lw・未着手)",
            "- **【人の作業・確認】実機で疎通確認** (Ln・未着手)",
            "- CMake CI (Ln・未着手)",
        ].join("\n"));
    });
    it("says so when the sprint has no tasks", () => {
        expect(dialogueSummary(snapshot([]))).toBe("- (タスクなし)");
    });
});
