import { useState, useEffect, useCallback } from "react";
import { smartSchedulerApi, groupApi, m1Schema } from "../lib/api";
import { HelpButton } from "../components/HelpOverlay";
import { DAY_LABELS, PERIODS_COUNT } from "../lib/constants";

interface SchedulingTask {
  id: string;
  groupId: string;
  title: string;
  duration: number;
  priority: number;
  preferredDays: number[];
  preferredPeriods: number[];
  instructorId: string | null;
  status: string;
  createdBy: string;
}

interface Instructor {
  id: string;
  name: string;
}

interface Placement {
  taskId: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  score: number;
}

interface SolveResponse {
  resultId: string;
  placements: Placement[];
  totalScore: number;
  unplacedTaskIds: string[];
  totalMembers: number;
}

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

export function SmartSchedulerPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [tasks, setTasks] = useState<SchedulingTask[]>([]);
  const [solveResult, setSolveResult] = useState<SolveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // 講師一覧
  const [instructors, setInstructors] = useState<Instructor[]>([]);

  // タスク追加フォーム
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState(1);
  const [newPriority, setNewPriority] = useState(0);
  const [newPreferredDays, setNewPreferredDays] = useState<number[]>([]);
  const [newPreferredPeriods, setNewPreferredPeriods] = useState<number[]>([]);
  const [newInstructorId, setNewInstructorId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // 休日考慮オプション
  const [considerHolidays, setConsiderHolidays] = useState(true);
  const [considerBusinessDays, setConsiderBusinessDays] = useState(true);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  // グループ一覧と講師一覧を取得
  useEffect(() => {
    groupApi.listMyGroups().then((res: any) => {
      setGroups(res.groups || []);
    }).catch(() => {});
    m1Schema.getInstructors().then((res: any) => {
      setInstructors(res.instructors || []);
    }).catch(() => {});
  }, []);

  // グループ選択時にタスク取得
  const loadTasks = useCallback(async () => {
    if (!selectedGroupId) return;
    try {
      const res = await smartSchedulerApi.getTasks(selectedGroupId);
      setTasks(res.tasks || []);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  }, [selectedGroupId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedGroupId) {
      setTasks([]);
      setSolveResult(null);
      return;
    }
    loadTasks();
  }, [selectedGroupId, loadTasks]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAddTask = async () => {
    if (!newTitle.trim() || !selectedGroupId) return;
    try {
      await smartSchedulerApi.createTask({
        groupId: selectedGroupId,
        title: newTitle,
        duration: newDuration,
        priority: newPriority,
        preferredDays: newPreferredDays,
        preferredPeriods: newPreferredPeriods,
        instructorId: newInstructorId || undefined,
      });
      setNewTitle("");
      setNewDuration(1);
      setNewPriority(0);
      setNewPreferredDays([]);
      setNewPreferredPeriods([]);
      setNewInstructorId("");
      setShowAddForm(false);
      await loadTasks();
      showMsg("タスク追加しました");
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await smartSchedulerApi.deleteTask(taskId);
      await loadTasks();
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleSolve = async () => {
    if (!selectedGroupId) return;
    setLoading(true);
    setSolveResult(null);
    try {
      const res = await smartSchedulerApi.solve(selectedGroupId, {
        considerHolidays,
        considerBusinessDays,
      });
      setSolveResult(res);
      showMsg(`配置完了: ${res.placements.length}件配置, スコア ${res.totalScore}`);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!solveResult?.resultId) return;
    try {
      await smartSchedulerApi.confirm(solveResult.resultId);
      showMsg("配置を確定しました");
      setSolveResult(null);
      await loadTasks();
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  };

  const toggleDay = (day: number) => {
    setNewPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  const periodLabel = (p: number) => {
    const h = 9 + p;
    return `${h}:30`;
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>自動配置スケジューラ</h1>
          <HelpButton />
        </div>
        <p>入れたい予定をグループの空き状況を見て自動配置</p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: message.startsWith("Error") ? "var(--red)" : "var(--green)",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      {/* グループ選択 */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>グループ選択</label>
        <select
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          style={{ marginTop: "0.25rem" }}
        >
          <option value="">グループを選択...</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.memberCount}人)
            </option>
          ))}
        </select>
      </div>

      {selectedGroupId && (
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {/* タスク一覧 */}
          <div style={{ flex: "1 1 400px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", margin: 0 }}>
                配置したい予定 ({pendingCount}件未配置)
              </h3>
              <button
                className="primary"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? "閉じる" : "+ 追加"}
              </button>
            </div>

            {/* 追加フォーム */}
            {showAddForm && (
              <div className="card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
                <div className="form-group">
                  <label>タイトル</label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="例: MTG, 勉強会..."
                  />
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>コマ数</label>
                    <select
                      value={newDuration}
                      onChange={(e) => setNewDuration(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map((d) => (
                        <option key={d} value={d}>{d}コマ</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>優先度</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(Number(e.target.value))}
                    >
                      <option value={0}>普通</option>
                      <option value={1}>やや高い</option>
                      <option value={2}>高い</option>
                      <option value={3}>最優先</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>希望曜日 (任意)</label>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {DAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        style={{
                          padding: "0.2rem 0.5rem",
                          fontSize: "0.75rem",
                          background: newPreferredDays.includes(i)
                            ? "var(--accent)"
                            : "var(--bg-surface-2)",
                          color: newPreferredDays.includes(i)
                            ? "#fff"
                            : "var(--text-muted)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {instructors.length > 0 && (
                  <div className="form-group">
                    <label>担当講師 (任意)</label>
                    <select
                      value={newInstructorId}
                      onChange={(e) => setNewInstructorId(e.target.value)}
                    >
                      <option value="">指定なし</option>
                      {instructors.map((inst) => (
                        <option key={inst.id} value={inst.id}>{inst.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button className="primary" onClick={handleAddTask}>
                  追加
                </button>
              </div>
            )}

            {/* タスクリスト */}
            {tasks.length === 0 ? (
              <div className="empty-state">
                <p>まだ予定が登録されていません</p>
              </div>
            ) : (
              <div className="flex-col">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="card"
                    style={{
                      padding: "0.6rem 0.75rem",
                      opacity: task.status === "placed" ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                          {task.title}
                        </span>
                        <span
                          className={`badge ${task.status === "pending" ? "blue" : task.status === "placed" ? "green" : ""}`}
                          style={{ marginLeft: "0.5rem", fontSize: "0.65rem" }}
                        >
                          {task.status === "pending" ? "未配置" : task.status === "placed" ? "配置済" : task.status}
                        </span>
                      </div>
                      {task.status === "pending" && (
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.4rem",
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            color: "var(--text-muted)",
                          }}
                        >
                          削除
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {task.duration}コマ
                      {task.priority > 0 && ` | 優先度: ${task.priority}`}
                      {task.preferredDays.length > 0 && (
                        <> | 希望: {task.preferredDays.map((d) => DAY_LABELS[d]).join(",")}</>
                      )}
                      {task.instructorId && (
                        <> | 講師: {instructors.find((i) => i.id === task.instructorId)?.name || task.instructorId}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 配置結果・操作 */}
          <div style={{ flex: "1 1 350px" }}>
            <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              自動配置
            </h3>

            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", fontSize: "0.8rem", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={considerHolidays}
                  onChange={(e) => setConsiderHolidays(e.target.checked)}
                />
                休日を考慮する
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={considerBusinessDays}
                  onChange={(e) => setConsiderBusinessDays(e.target.checked)}
                />
                業務時間(平日)を考慮する
              </label>
            </div>

            <button
              className="primary"
              onClick={handleSolve}
              disabled={loading || pendingCount === 0}
              style={{ width: "100%", marginBottom: "1rem" }}
            >
              {loading ? "配置計算中..." : `自動配置を実行 (${pendingCount}件)`}
            </button>

            {/* 配置結果 */}
            {solveResult && (
              <div>
                <div className="card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    配置結果
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    スコア: {solveResult.totalScore} |
                    配置: {solveResult.placements.length}件 |
                    メンバー: {solveResult.totalMembers}人
                  </div>

                  {solveResult.unplacedTaskIds.length > 0 && (
                    <div style={{
                      fontSize: "0.75rem",
                      color: "var(--red)",
                      marginBottom: "0.5rem",
                    }}>
                      {solveResult.unplacedTaskIds.length}件は配置できませんでした
                    </div>
                  )}

                  {/* 配置マップ */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "0.3rem", borderBottom: "1px solid var(--border)" }}>予定</th>
                          <th style={{ padding: "0.3rem", borderBottom: "1px solid var(--border)" }}>曜日</th>
                          <th style={{ padding: "0.3rem", borderBottom: "1px solid var(--border)" }}>時間</th>
                          <th style={{ padding: "0.3rem", borderBottom: "1px solid var(--border)" }}>スコア</th>
                        </tr>
                      </thead>
                      <tbody>
                        {solveResult.placements.map((p) => (
                          <tr key={p.taskId}>
                            <td style={{ padding: "0.3rem" }}>{p.title}</td>
                            <td style={{ padding: "0.3rem" }}>{DAY_LABELS[p.day]}</td>
                            <td style={{ padding: "0.3rem" }}>
                              {periodLabel(p.period)}〜{periodLabel(p.period + p.duration)}
                            </td>
                            <td style={{ padding: "0.3rem" }}>
                              <span className="badge green">{p.score}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 週間プレビュー */}
                <div className="card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    週間プレビュー
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.65rem",
                      tableLayout: "fixed",
                    }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40, padding: "0.2rem", borderBottom: "1px solid var(--border)" }}></th>
                          {DAY_LABELS.map((d) => (
                            <th key={d} style={{ padding: "0.2rem", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                              {d}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: PERIODS_COUNT }, (_, period) => {
                          return (
                            <tr key={period}>
                              <td style={{
                                padding: "0.15rem 0.2rem",
                                fontSize: "0.6rem",
                                color: "var(--text-muted)",
                                borderRight: "1px solid var(--border)",
                              }}>
                                {periodLabel(period)}
                              </td>
                              {Array.from({ length: 7 }, (_, day) => {
                                const placement = solveResult.placements.find(
                                  (p) => p.day === day && period >= p.period && period < p.period + p.duration
                                );
                                return (
                                  <td
                                    key={day}
                                    style={{
                                      padding: "0.15rem",
                                      textAlign: "center",
                                      background: placement
                                        ? "rgba(63, 185, 80, 0.25)"
                                        : "transparent",
                                      border: "1px solid var(--border)",
                                      fontSize: "0.6rem",
                                    }}
                                  >
                                    {placement && period === placement.period
                                      ? placement.title
                                      : placement
                                        ? "↓"
                                        : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="primary"
                    onClick={handleConfirm}
                    style={{ flex: 1 }}
                  >
                    この配置で確定
                  </button>
                  <button
                    onClick={() => setSolveResult(null)}
                    style={{ flex: 1 }}
                  >
                    やり直す
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
