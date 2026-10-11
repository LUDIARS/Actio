// @spec スプリントフェーズの通知と受信
import type { SprintPhaseSnapshot } from "@ludiars/terpsichore";

type SnapshotTask = SprintPhaseSnapshot["tasks"][number];

const STATUS_LABELS: Record<string, string> = {
    open: "未着手", in_progress: "進行中", blocked: "ブロック", done: "完了", cancelled: "中止",
};
const TITLE_LIMIT = 80;

function shortTitle(title: string): string {
    const trimmed = title.trim();
    return trimmed.length <= TITLE_LIMIT ? trimmed : trimmed.slice(0, TITLE_LIMIT - 1) + "…";
}

/** 1 タスク 1 行。ID は出さず、題名・プロジェクト・状態だけを見せる。 */
export function taskBullet(task: SnapshotTask): string {
    const status = STATUS_LABELS[task.status] ?? task.status;
    const meta = [task.projectId, status].filter(Boolean).join("・");
    return `- ${shortTitle(task.title)} (${meta})`;
}

/**
 * Discord のスプリント会話に出す要約。スプリントに割り付いたタスクの箇条書きだけを基本にし、
 * 振り返りと次計画は記入・選択済みのときだけ後ろに足す (未記入の欄で本文を埋めない)。
 */
export function dialogueSummary(snapshot: SprintPhaseSnapshot): string {
    const lines = snapshot.tasks.length > 0 ? snapshot.tasks.map(taskBullet) : ["- (タスクなし)"];
    if (snapshot.retrospective.trim()) lines.push("", "振り返り:", snapshot.retrospective.trim());
    const next = snapshot.nextPlan;
    if (next) {
        lines.push("", `次スプリント ${next.sprint.name} のタスク:`);
        lines.push(...(next.tasks.length > 0 ? next.tasks.map(taskBullet) : ["- (タスクなし)"]));
    }
    return lines.join("\n");
}
