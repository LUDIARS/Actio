import { useState, useEffect, useCallback } from "react";
import { tasksApi } from "../lib/api";
import type {
  CoreTask,
  CreateTaskInput,
  TaskPriority,
  TaskStatus,
} from "../lib/api-types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "未着手",
  in_progress: "進行中",
  blocked: "ブロック",
  done: "完了",
  cancelled: "キャンセル",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  open: "#8B949E",
  in_progress: "#58A6FF",
  blocked: "#F85149",
  done: "#3FB950",
  cancelled: "#6E7681",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "最優先",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "#8B949E",
  medium: "#58A6FF",
  high: "#D29922",
  critical: "#F85149",
};

type Scope = "owned" | "assigned" | "all";

const EMPTY_FORM: CreateTaskInput = {
  title: "",
  description: "",
  requirements: "",
  status: "open",
  priority: "medium",
  deadline: null,
  estimatedMinutes: null,
};

function formatDeadline(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${month}/${day}(${weekdays[d.getDay()]}) ${hh}:${mm}`;
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TasksPage() {
  const [tasks, setTasks] = useState<CoreTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateTaskInput>(EMPTY_FORM);
  const [scope, setScope] = useState<Scope>("owned");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await tasksApi.list({
        scope,
        status: statusFilter || undefined,
      });
      setTasks(res.tasks);
    } catch (e: unknown) {
      showMsg(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [scope, statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (task: CoreTask) => {
    setForm({
      title: task.title,
      description: task.description ?? "",
      requirements: task.requirements ?? "",
      status: task.status,
      priority: task.priority,
      deadline: task.deadline,
      estimatedMinutes: task.estimatedMinutes,
      assigneeId: task.assigneeId ?? undefined,
      groupId: task.groupId ?? undefined,
    });
    setEditingId(task.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      showMsg("タイトルは必須です");
      return;
    }
    const payload: CreateTaskInput = {
      title: form.title.trim(),
      description: form.description?.toString().trim() || null,
      requirements: form.requirements?.toString().trim() || null,
      status: form.status,
      priority: form.priority,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      estimatedMinutes: form.estimatedMinutes ?? null,
    };

    try {
      setLoading(true);
      if (editingId) {
        await tasksApi.update(editingId, payload);
        showMsg("タスクを更新しました");
      } else {
        await tasksApi.create(payload);
        showMsg("タスクを作成しました");
      }
      resetForm();
      await fetchTasks();
    } catch (e: unknown) {
      showMsg(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このタスクを削除しますか？")) return;
    try {
      await tasksApi.remove(id);
      showMsg("削除しました");
      await fetchTasks();
    } catch (e: unknown) {
      showMsg(`Error: ${(e as Error).message}`);
    }
  };

  const handleStatusChange = async (task: CoreTask, status: TaskStatus) => {
    try {
      await tasksApi.update(task.id, { status });
      await fetchTasks();
    } catch (e: unknown) {
      showMsg(`Error: ${(e as Error).message}`);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: "0.4rem 0.6rem",
    background: "var(--bg-surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text)",
    fontSize: "0.85rem",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "0.4rem 1rem",
    background: "var(--accent)",
    color: "#000",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>タスク</h1>
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              setForm(EMPTY_FORM);
              setEditingId(null);
              setShowForm(true);
            }
          }}
          style={btnPrimary}
        >
          {showForm ? "閉じる" : "+ 新規作成"}
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: "0.5rem 1rem",
            marginBottom: "1rem",
            background: message.startsWith("Error")
              ? "rgba(248,81,73,0.15)"
              : "rgba(63,185,80,0.15)",
            border: `1px solid ${message.startsWith("Error") ? "var(--red)" : "var(--green)"}`,
            borderRadius: "var(--radius-sm)",
            fontSize: "0.85rem",
            color: message.startsWith("Error") ? "var(--red)" : "var(--green)",
          }}
        >
          {message}
        </div>
      )}

      {showForm && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            {editingId ? "タスクを編集" : "新規タスク"}
          </h3>
          <input
            type="text"
            placeholder="タイトル *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={inputStyle}
          />
          <textarea
            placeholder="説明 (任意)"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <textarea
            placeholder="要件 (任意)"
            value={form.requirements ?? ""}
            onChange={(e) => setForm({ ...form, requirements: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: 120 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>ステータス</span>
              <select
                value={form.status ?? "open"}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                style={inputStyle}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: 120 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>優先度</span>
              <select
                value={form.priority ?? "medium"}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                style={inputStyle}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: 180 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>期限</span>
              <input
                type="datetime-local"
                value={toLocalInputValue(form.deadline ?? null)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    deadline: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", minWidth: 120 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>見積(分)</span>
              <input
                type="number"
                min={0}
                value={form.estimatedMinutes ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    estimatedMinutes: e.target.value ? Number(e.target.value) : null,
                  })
                }
                style={inputStyle}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button onClick={handleSubmit} disabled={loading} style={btnPrimary}>
              {editingId ? "更新" : "作成"}
            </button>
            <button
              onClick={resetForm}
              disabled={loading}
              style={{
                ...btnPrimary,
                background: "var(--bg-surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* フィルタ */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        {(["owned", "assigned", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{
              padding: "0.25rem 0.6rem",
              background: scope === s ? "var(--accent)" : "var(--bg-surface-2)",
              color: scope === s ? "#000" : "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            {s === "owned" ? "自分が作成" : s === "assigned" ? "自分が担当" : "全て"}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {(["", "open", "in_progress", "blocked", "done", "cancelled"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s as TaskStatus | "")}
            style={{
              padding: "0.25rem 0.6rem",
              background: statusFilter === s ? "var(--accent)" : "var(--bg-surface-2)",
              color: statusFilter === s ? "#000" : "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            {s === "" ? "全ステータス" : STATUS_LABELS[s as TaskStatus]}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      {loading && tasks.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>読み込み中...</p>
      ) : tasks.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>タスクはありません</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                padding: "0.75rem 1rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "0.1rem 0.4rem",
                    background: STATUS_COLORS[task.status],
                    color: "#fff",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                >
                  {STATUS_LABELS[task.status]}
                </span>
                <span
                  style={{
                    padding: "0.1rem 0.4rem",
                    border: `1px solid ${PRIORITY_COLORS[task.priority]}`,
                    color: PRIORITY_COLORS[task.priority],
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                >
                  {PRIORITY_LABELS[task.priority]}
                </span>
                <span style={{ fontWeight: 600, fontSize: "0.95rem", flex: 1 }}>{task.title}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  期限: {formatDeadline(task.deadline)}
                </span>
              </div>
              {task.description && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                  {task.description}
                </div>
              )}
              {task.requirements && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    whiteSpace: "pre-wrap",
                    padding: "0.4rem 0.6rem",
                    background: "var(--bg-surface-2)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <strong style={{ color: "var(--text)" }}>要件: </strong>
                  {task.requirements}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                  style={{ ...inputStyle, padding: "0.25rem 0.4rem", fontSize: "0.75rem" }}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleEdit(task)}
                  style={{
                    padding: "0.25rem 0.6rem",
                    background: "var(--bg-surface-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  style={{
                    padding: "0.25rem 0.6rem",
                    background: "transparent",
                    color: "var(--red)",
                    border: "1px solid var(--red)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
