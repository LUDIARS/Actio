import { useState } from "react";
import { tasksApi } from "../lib/api";
import type { CoreTask } from "../lib/api-types";

/**
 * 一覧は要約だけなので、 説明と要件は開いたときに GET /api/tasks/:id で取る。
 * updatedAt が変わったら (編集後など) 次に開いたときに取り直す。
 */
export function TaskDetailToggle({ taskId, updatedAt }: { taskId: string; updatedAt: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{ task: CoreTask; updatedAt: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail && detail.updatedAt === updatedAt) return;
    setLoading(true);
    setError("");
    try {
      const res = await tasksApi.get(taskId);
      setDetail({ task: res.task, updatedAt });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const task = detail?.task;
  return (
    <div className="task-detail">
      <button type="button" aria-expanded={open} onClick={() => void toggle()} className="task-detail-toggle">
        {open ? "詳細を閉じる" : "詳細"}
      </button>
      {open && (
        <div className="task-detail-body">
          {loading && <p className="task-detail-note">読み込み中...</p>}
          {error && <p className="task-detail-error">Error: {error}</p>}
          {task && !loading && (
            <>
              {task.description
                ? <div className="task-detail-text">{task.description}</div>
                : <p className="task-detail-note">説明はありません</p>}
              {task.requirements && (
                <div className="task-detail-requirements">
                  <strong>要件: </strong>
                  {task.requirements}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
