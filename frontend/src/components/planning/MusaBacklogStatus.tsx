import type { PlanningTask } from "../../lib/planning-api";

const states: Record<string, string> = {
  open: "未着手", in_progress: "進行中", blocked: "保留", done: "完了", cancelled: "中止",
};

export function MusaBacklogStatus({ tasks }: { tasks: PlanningTask[] }) {
  const assigned = tasks.filter(task => task.executorType === "ai" &&
    /(?:^|[/:@])musa(?:$|[-/:@])/i.test(task.aiExecutor ?? ""));
  return <section className="card" aria-label="MUSA の担当タスク">
    <h2>MUSA の担当タスク</h2>
    {assigned.length ? <ul>{assigned.map(task => <li key={task.id}>
      {task.aiExecutor} · {task.title}（{states[task.status] ?? task.status}）
    </li>)}</ul> : <p>表示範囲に MUSA の担当が登録されたタスクはありません。</p>}
  </section>;
}
