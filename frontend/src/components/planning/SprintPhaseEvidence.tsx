// @spec スプリントフェーズのAPIと画面契約
import type { Sprint } from "@ludiars/terpsichore/types";
import type { TeamProject } from "../../lib/planning-api";
import type { SprintPhaseTask } from "../../lib/sprint-phase-api";

const taskStatus: Record<string, string> = { open: "未着手", in_progress: "実装中", blocked: "停止中", done: "実装完了", cancelled: "取消" };
export function SprintPhaseEvidence({ sprint, tasks, complete, projects }: {
  sprint: Sprint; tasks: SprintPhaseTask[]; complete: boolean; projects: TeamProject[];
}) {
  return <section className="sprint-phase-evidence">
    <h3>{sprint.name}</h3>
    <p><strong>目標</strong> {sprint.goal || "未設定"}</p>
    <p>{sprint.startsOn} ～ {sprint.endsOn} ／容量 {sprint.capacityMinutes ?? "未設定"} 分</p>
    <p>全プロジェクトの対象 {tasks.length} 件中、実装完了 {tasks.filter(task => task.status === "done").length} 件</p>
    {!complete && <p role="alert">対象全件を確認できていません。最新状態の取得が必要です。</p>}
    {tasks.length === 0 && <p>対象バックログがありません。計画画面でタスクを割り付けてください。</p>}
    <ul className="sprint-phase-tasks">{tasks.map(task => <li key={task.id}>
      <details><summary>{task.title} — {taskStatus[task.status] ?? task.status} ／ {projects.find(project => project.code === task.projectId)?.name ?? task.projectId ?? "プロジェクト未設定"}</summary>
        <p>{task.description || "内容未設定"}</p>
        <p><strong>確認条件</strong></p><pre>{task.requirements || "未設定"}</pre>
        {task.completionEvidence?.trim() ? <><p><strong>完了の根拠</strong></p><pre>{task.completionEvidence}</pre></>
          : task.status === "done" && <p>完了の根拠は未記録</p>}
        <p>見積 {task.estimatedMinutes ?? "未設定"} 分</p>
      </details>
    </li>)}</ul>
  </section>;
}
