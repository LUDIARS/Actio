import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DAY_LABELS, DAYS_COUNT, PERIODS_COUNT } from "../lib/constants";
import { m4, m3, smartSchedulerApi, groupApi, m1Schema } from "../lib/api";
import { HelpButton } from "../components/HelpOverlay";
import { TimetableGrid, type GridSlot } from "../components/TimetableGrid";

interface Reservation {
  id: string;
  groupId: string;
  title: string;
  day: number;
  period: number;
  roomId: string;
  roomName?: string;
  createdBy: string;
  participants: string[];
  status: string;
  createdAt: string;
  note: string;
  version: number;
}

type TabKey = "reservations" | "scheduler" | "smart-scheduler";

export function ReservationsPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>("reservations");

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>予約・スケジューラ</h1>
          <HelpButton />
        </div>
        <p>予約管理、空きコマ提案、自動配置を一元管理</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        {([
          { key: "reservations" as const, label: "予約管理" },
          { key: "scheduler" as const, label: "オートスケジューラ" },
          { key: "smart-scheduler" as const, label: "自動配置" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.5rem 1rem", background: "transparent", border: "none",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", fontSize: "0.85rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reservations" && <ReservationsTab searchParams={searchParams} />}
      {tab === "scheduler" && <SchedulerTab />}
      {tab === "smart-scheduler" && <SmartSchedulerTab />}
    </div>
  );
}

// ─── 予約管理タブ ─────────────────────────────────────────

function ReservationsTab({ searchParams }: { searchParams: URLSearchParams }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showForm, setShowForm] = useState(searchParams.has("day") || false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    groupId: searchParams.get("groupId") || "",
    title: "",
    day: parseInt(searchParams.get("day") || "0", 10),
    period: parseInt(searchParams.get("period") || "0", 10),
    roomId: searchParams.get("roomId") || "",
    participants: "",
    note: "",
  });

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const fetchReservations = useCallback(async () => {
    try {
      const result = await m4.listReservations();
      setReservations(result.reservations || []);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  }, []);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const participants = form.participants.split(",").map((s) => s.trim()).filter(Boolean);
      await m4.createReservation({
        groupId: form.groupId,
        title: form.title,
        day: form.day,
        period: form.period,
        roomId: form.roomId,
        participants,
        note: form.note,
      });
      showMsg("Reservation created");
      setShowForm(false);
      fetchReservations();
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleCancel = async (id: string) => {
    try {
      await m4.cancelReservation(id);
      showMsg("Reservation cancelled");
      fetchReservations();
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  };

  const statusBadge = (status: string) => {
    const cls = status === "confirmed" ? "green" : status === "cancelled" ? "red" : "orange";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  return (
    <div>
      {message && (
        <div className="card" style={{ marginBottom: "1rem", borderColor: message.startsWith("Error") ? "var(--red)" : "var(--green)", fontSize: "0.85rem" }}>
          {message}
        </div>
      )}

      <div className="toolbar">
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "閉じる" : "新規予約"}
        </button>
        <button onClick={fetchReservations}>更新</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>予約作成</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="form-group">
              <label>タイトル</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="MTGタイトル" />
            </div>
            <div className="form-group">
              <label>グループID</label>
              <input value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} placeholder="group-id" />
            </div>
            <div className="form-group">
              <label>曜日</label>
              <select value={form.day} onChange={(e) => setForm({ ...form, day: parseInt(e.target.value, 10) })}>
                {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>コマ</label>
              <select value={form.period} onChange={(e) => setForm({ ...form, period: parseInt(e.target.value, 10) })}>
                {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i + 1}限</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>教室ID</label>
              <input value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} placeholder="room-id" />
            </div>
            <div className="form-group">
              <label>参加者（カンマ区切り）</label>
              <input value={form.participants} onChange={(e) => setForm({ ...form, participants: e.target.value })} placeholder="user-1, user-2" />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>メモ</label>
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="メモ（公開）" rows={2} />
            </div>
          </div>
          <button className="primary" onClick={handleCreate} disabled={loading || !form.title} style={{ marginTop: "0.5rem" }}>
            {loading ? "作成中..." : "予約を確定"}
          </button>
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="empty-state"><p>予約がありません</p></div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>曜日・コマ</th>
              <th>教室</th>
              <th>参加者</th>
              <th>ステータス</th>
              <th>作成日</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.title}</td>
                <td>{DAY_LABELS[r.day]} {r.period + 1}限</td>
                <td>{r.roomName || r.roomId}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {r.participants.map((p) => (
                      <span key={p} style={{ fontSize: "0.7rem", background: "var(--bg-surface-2)", padding: "0.1rem 0.3rem", borderRadius: 3 }}>{p}</span>
                    ))}
                  </div>
                </td>
                <td>{statusBadge(r.status)}</td>
                <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(r.createdAt).toLocaleDateString("ja-JP")}</td>
                <td>
                  {r.status === "confirmed" && (
                    <button className="danger" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }} onClick={() => handleCancel(r.id)}>キャンセル</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── オートスケジューラタブ ──────────────────────────────

interface Suggestion {
  day: number;
  period: number;
  score: number;
  availableCount: number;
  totalMembers: number;
  availableRooms: string[];
  reasons: string[];
}

interface AvailabilitySlot {
  day: number;
  period: number;
  availableCount: number;
  totalMembers: number;
  isFullyAvailable: boolean;
  isPartiallyAvailable: boolean;
  availableRooms: string[];
}

function SchedulerTab() {
  const navigate = useNavigate();
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [totalMembers, setTotalMembers] = useState(0);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [newMembers, setNewMembers] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const members = newMembers.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const result = await m3.createGroup({ name: newGroupName, members, createdBy: localStorage.getItem("userId") || "user-1" });
      setGroupId(result.id);
      setGroupName(result.name);
      setShowCreate(false);
      showMsg(`Group created: ${result.name}`);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleLoadGroup = async () => {
    if (!groupId.trim()) return;
    setLoading(true);
    try {
      const group = await m3.getGroup(groupId);
      setGroupName(group.name);
      const [avail, sugg] = await Promise.all([m3.getAvailability(groupId), m3.getSuggestions(groupId)]);
      setTotalMembers(avail.totalMembers);
      setAvailability(avail.availability || []);
      setSuggestions(sugg.suggestions || []);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const getHeatColor = (count: number, total: number): string => {
    if (total === 0) return "var(--slot-free)";
    const ratio = count / total;
    if (ratio === 1) return "rgba(63, 185, 80, 0.4)";
    if (ratio >= 0.7) return "rgba(63, 185, 80, 0.2)";
    if (ratio > 0) return "rgba(210, 153, 34, 0.15)";
    return "var(--bg-surface)";
  };

  const buildSlots = (): GridSlot[][] => {
    const grid: GridSlot[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array.from({ length: PERIODS_COUNT }, () => ({ label: "", status: "free" as const }))
    );
    for (const slot of availability) {
      const label = slot.availableCount > 0 ? `${slot.availableCount}/${slot.totalMembers}` : "";
      grid[slot.day][slot.period] = { label, color: getHeatColor(slot.availableCount, slot.totalMembers) };
    }
    return grid;
  };

  const handleBookFromSuggestion = (s: Suggestion) => {
    const params = new URLSearchParams({ day: String(s.day), period: String(s.period), groupId, roomId: s.availableRooms[0] || "" });
    navigate(`/reservations/new?${params}`);
  };

  return (
    <div>
      {message && (
        <div className="card" style={{ marginBottom: "1rem", borderColor: message.startsWith("Error") ? "var(--red)" : "var(--green)", fontSize: "0.85rem" }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>グループID</label>
            <input value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="グループIDを入力..." />
          </div>
          <button className="primary" onClick={handleLoadGroup} disabled={loading}>
            {loading ? "読込中..." : "空き計算"}
          </button>
          <button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "閉じる" : "新規グループ"}
          </button>
        </div>

        {showCreate && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <div className="form-group">
              <label>グループ名</label>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="例: チームA" />
            </div>
            <div className="form-group">
              <label>メンバーID（カンマ区切り）</label>
              <input value={newMembers} onChange={(e) => setNewMembers(e.target.value)} placeholder="user-1, user-2, user-3" />
            </div>
            <button className="primary" onClick={handleCreateGroup}>作成</button>
          </div>
        )}
      </div>

      {groupName && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", fontSize: "0.8rem" }}>
          <span className="badge blue">{groupName}</span>
          <span className="badge green">{totalMembers} members</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 500px" }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>空きコマヒートマップ</h3>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem", fontSize: "0.7rem", color: "var(--text-muted)" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(63, 185, 80, 0.4)", borderRadius: 2, marginRight: 4 }} />全員空き</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(63, 185, 80, 0.2)", borderRadius: 2, marginRight: 4 }} />70%+空き</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(210, 153, 34, 0.15)", borderRadius: 2, marginRight: 4 }} />一部空き</span>
          </div>
          <TimetableGrid slots={buildSlots()} />
        </div>

        <div style={{ flex: "1 1 280px" }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>MTG候補ランキング</h3>
          {suggestions.length === 0 ? (
            <div className="empty-state"><p>グループを読み込むと候補が表示されます</p></div>
          ) : (
            <div className="flex-col">
              {suggestions.slice(0, 10).map((s, i) => (
                <div key={`${s.day}-${s.period}`} className="card" style={{ padding: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>#{i + 1} {DAY_LABELS[s.day]} {s.period + 1}限</span>
                    <span className="badge green">Score: {s.score}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                    参加: {s.availableCount}/{s.totalMembers} | 空き教室: {s.availableRooms.length}
                  </div>
                  <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    {s.reasons.map((r) => (
                      <span key={r} style={{ fontSize: "0.65rem", background: "var(--bg-surface-2)", padding: "0.1rem 0.4rem", borderRadius: 3 }}>{r}</span>
                    ))}
                  </div>
                  <button className="primary" style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }} onClick={() => handleBookFromSuggestion(s)}>
                    予約へ
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 自動配置タブ ─────────────────────────────────────────

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

function SmartSchedulerTab() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [tasks, setTasks] = useState<SchedulingTask[]>([]);
  const [solveResult, setSolveResult] = useState<SolveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [instructors, setInstructors] = useState<Instructor[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState(1);
  const [newPriority, setNewPriority] = useState(0);
  const [newPreferredDays, setNewPreferredDays] = useState<number[]>([]);
  const [newPreferredPeriods, setNewPreferredPeriods] = useState<number[]>([]);
  const [newInstructorId, setNewInstructorId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const [considerHolidays, setConsiderHolidays] = useState(true);
  const [considerBusinessDays, setConsiderBusinessDays] = useState(true);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  useEffect(() => {
    groupApi.listMyGroups().then((res: any) => { setGroups(res.groups || []); }).catch(() => {});
    m1Schema.getInstructors().then((res: any) => { setInstructors(res.instructors || []); }).catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    if (!selectedGroupId) return;
    try {
      const res = await smartSchedulerApi.getTasks(selectedGroupId);
      setTasks(res.tasks || []);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) { setTasks([]); setSolveResult(null); return; }
    loadTasks();
  }, [selectedGroupId, loadTasks]);

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
      setNewTitle(""); setNewDuration(1); setNewPriority(0);
      setNewPreferredDays([]); setNewPreferredPeriods([]); setNewInstructorId("");
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
      const res = await smartSchedulerApi.solve(selectedGroupId, { considerHolidays, considerBusinessDays });
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
    setNewPreferredDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  const periodLabel = (p: number) => {
    const h = 9 + p;
    return `${h}:30`;
  };

  return (
    <div>
      {message && (
        <div className="card" style={{ marginBottom: "1rem", borderColor: message.startsWith("Error") ? "var(--red)" : "var(--green)", fontSize: "0.85rem" }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>グループ選択</label>
        <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} style={{ marginTop: "0.25rem" }}>
          <option value="">グループを選択...</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.memberCount}人)</option>)}
        </select>
      </div>

      {selectedGroupId && (
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 400px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", margin: 0 }}>配置したい予定 ({pendingCount}件未配置)</h3>
              <button className="primary" style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }} onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? "閉じる" : "+ 追加"}
              </button>
            </div>

            {showAddForm && (
              <div className="card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
                <div className="form-group">
                  <label>タイトル</label>
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例: MTG, 勉強会..." />
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>コマ数</label>
                    <select value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}コマ</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>優先度</label>
                    <select value={newPriority} onChange={(e) => setNewPriority(Number(e.target.value))}>
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
                          padding: "0.2rem 0.5rem", fontSize: "0.75rem",
                          background: newPreferredDays.includes(i) ? "var(--accent)" : "var(--bg-surface-2)",
                          color: newPreferredDays.includes(i) ? "#fff" : "var(--text-muted)",
                          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer",
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
                    <select value={newInstructorId} onChange={(e) => setNewInstructorId(e.target.value)}>
                      <option value="">指定なし</option>
                      {instructors.map((inst) => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
                    </select>
                  </div>
                )}
                <button className="primary" onClick={handleAddTask}>追加</button>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="empty-state"><p>まだ予定が登録されていません</p></div>
            ) : (
              <div className="flex-col">
                {tasks.map((task) => (
                  <div key={task.id} className="card" style={{ padding: "0.6rem 0.75rem", opacity: task.status === "placed" ? 0.6 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{task.title}</span>
                        <span className={`badge ${task.status === "pending" ? "blue" : task.status === "placed" ? "green" : ""}`} style={{ marginLeft: "0.5rem", fontSize: "0.65rem" }}>
                          {task.status === "pending" ? "未配置" : task.status === "placed" ? "配置済" : task.status}
                        </span>
                      </div>
                      {task.status === "pending" && (
                        <button onClick={() => handleDeleteTask(task.id)} style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)" }}>
                          削除
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {task.duration}コマ
                      {task.priority > 0 && ` | 優先度: ${task.priority}`}
                      {task.preferredDays.length > 0 && <> | 希望: {task.preferredDays.map((d) => DAY_LABELS[d]).join(",")}</>}
                      {task.instructorId && <> | 講師: {instructors.find((i) => i.id === task.instructorId)?.name || task.instructorId}</>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: "1 1 350px" }}>
            <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>自動配置</h3>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", fontSize: "0.8rem", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                <input type="checkbox" checked={considerHolidays} onChange={(e) => setConsiderHolidays(e.target.checked)} />
                休日を考慮する
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                <input type="checkbox" checked={considerBusinessDays} onChange={(e) => setConsiderBusinessDays(e.target.checked)} />
                業務時間(平日)を考慮する
              </label>
            </div>

            <button className="primary" onClick={handleSolve} disabled={loading || pendingCount === 0} style={{ width: "100%", marginBottom: "1rem" }}>
              {loading ? "配置計算中..." : `自動配置を実行 (${pendingCount}件)`}
            </button>

            {solveResult && (
              <div>
                <div className="card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>配置結果</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    スコア: {solveResult.totalScore} | 配置: {solveResult.placements.length}件 | メンバー: {solveResult.totalMembers}人
                  </div>

                  {solveResult.unplacedTaskIds.length > 0 && (
                    <div style={{ fontSize: "0.75rem", color: "var(--red)", marginBottom: "0.5rem" }}>
                      {solveResult.unplacedTaskIds.length}件は配置できませんでした
                    </div>
                  )}

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
                            <td style={{ padding: "0.3rem" }}>{periodLabel(p.period)}〜{periodLabel(p.period + p.duration)}</td>
                            <td style={{ padding: "0.3rem" }}><span className="badge green">{p.score}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>週間プレビュー</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.65rem", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40, padding: "0.2rem", borderBottom: "1px solid var(--border)" }}></th>
                          {DAY_LABELS.map((d) => <th key={d} style={{ padding: "0.2rem", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: PERIODS_COUNT }, (_, period) => (
                          <tr key={period}>
                            <td style={{ padding: "0.15rem 0.2rem", fontSize: "0.6rem", color: "var(--text-muted)", borderRight: "1px solid var(--border)" }}>
                              {periodLabel(period)}
                            </td>
                            {Array.from({ length: 7 }, (_, day) => {
                              const placement = solveResult.placements.find((p) => p.day === day && period >= p.period && period < p.period + p.duration);
                              return (
                                <td key={day} style={{ padding: "0.15rem", textAlign: "center", background: placement ? "rgba(63, 185, 80, 0.25)" : "transparent", border: "1px solid var(--border)", fontSize: "0.6rem" }}>
                                  {placement && period === placement.period ? placement.title : placement ? "↓" : ""}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="primary" onClick={handleConfirm} style={{ flex: 1 }}>この配置で確定</button>
                  <button onClick={() => setSolveResult(null)} style={{ flex: 1 }}>やり直す</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
