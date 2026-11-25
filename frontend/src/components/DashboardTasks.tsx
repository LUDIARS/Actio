import { useState } from "react";
import { Link } from "react-router-dom";
import { useTaskListPages } from "../hooks/useTaskListPages";
import { PRIORITY_LABELS } from "../lib/task-priority";

export function DashboardTasks() {
  const [error, setError] = useState("");
  const { tasks, nextCursor, loading, loadMore, reload } = useTaskListPages({
    scope: "all", kind: "task", status: "open,in_progress,blocked,todo,doing", sort: "priority", limit: 10,
  }, setError);

  return <section className="card">
    <h3>未完了のタスク（優先度順）</h3>
    {tasks.length > 0 && <ol>{tasks.map(task => <li key={task.id}>
      <strong>{PRIORITY_LABELS[task.priority]}</strong> {task.title}
    </li>)}</ol>}
    {loading && <p>読み込み中…</p>}
    {!loading && !error && tasks.length === 0 && <p>未完了のタスクはありません。</p>}
    {error && <p role="alert">{error} <button disabled={loading} onClick={() => {
      setError("");
      void reload();
    }}>再読み込み</button></p>}
    {nextCursor && <button disabled={loading} onClick={() => { setError(""); void loadMore(); }}>続きを表示</button>}
    <Link to="/tasks">タスク管理</Link>
  </section>;
}
