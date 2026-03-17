import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { groupApi } from "../lib/api";
import { DAY_LABELS, getPeriodLabel } from "../lib/constants";

interface Group {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  role: string;
  createdAt: string;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  members: Array<{ userId: string; name: string; email: string; role: string }>;
  schedules: Array<{
    id: string;
    title: string;
    day: number;
    period: number;
    duration: number;
    date: string | null;
    scheduleType: string;
  }>;
}

export function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    day: 0,
    period: 0,
    duration: 1,
    scheduleType: "recurring" as "recurring" | "oneshot",
    date: "",
  });
  const [joinGroupId, setJoinGroupId] = useState("");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await groupApi.listMyGroups();
      setGroups(data.groups || []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const loadGroupDetail = async (groupId: string) => {
    try {
      const data = await groupApi.getGroup(groupId);
      setSelectedGroup(data.group || null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await groupApi.createGroup(createForm);
      setShowCreateForm(false);
      setCreateForm({ name: "", description: "" });
      await loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoin = async () => {
    setError("");
    if (!joinGroupId.trim()) return;
    try {
      await groupApi.joinGroup(joinGroupId.trim());
      setJoinGroupId("");
      await loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLeave = async (groupId: string) => {
    if (!confirm("このグループから脱退しますか？")) return;
    try {
      await groupApi.leaveGroup(groupId);
      setSelectedGroup(null);
      await loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setError("");
    try {
      await groupApi.addSchedule(selectedGroup.id, scheduleForm);
      setShowAddSchedule(false);
      setScheduleForm({ title: "", day: 0, period: 0, duration: 1, scheduleType: "recurring", date: "" });
      await loadGroupDetail(selectedGroup.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>グループ</h1>
        <p>複数のグループに所属し、グループごとの予定を管理できます</p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(248, 81, 73, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1rem" }}>
        {/* グループ一覧 */}
        <div>
          <div className="toolbar" style={{ marginBottom: "0.5rem" }}>
            <button className="primary" onClick={() => setShowCreateForm(!showCreateForm)} style={{ fontSize: "0.8rem" }}>
              {showCreateForm ? "キャンセル" : "グループ作成"}
            </button>
          </div>

          {showCreateForm && (
            <div className="card" style={{ marginBottom: "0.75rem" }}>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>グループ名</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例: プロジェクトA"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>説明</label>
                  <input
                    type="text"
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="任意"
                  />
                </div>
                <button type="submit" className="primary" style={{ fontSize: "0.8rem" }}>作成</button>
              </form>
            </div>
          )}

          {/* グループ参加 */}
          <div className="card" style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={joinGroupId}
                onChange={(e) => setJoinGroupId(e.target.value)}
                placeholder="グループIDで参加"
                style={{ fontSize: "0.8rem", flex: 1 }}
              />
              <button onClick={handleJoin} style={{ fontSize: "0.8rem" }}>参加</button>
            </div>
          </div>

          {/* グループリスト */}
          {loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>読み込み中...</div>
          ) : groups.length === 0 ? (
            <div className="empty-state" style={{ padding: "1rem" }}>
              <p>グループなし</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => loadGroupDetail(g.id)}
                  className="card"
                  style={{
                    cursor: "pointer",
                    borderLeft: selectedGroup?.id === g.id ? "3px solid var(--accent)" : "3px solid transparent",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{g.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {g.memberCount}人 / {g.role}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* グループ詳細 */}
        <div>
          {selectedGroup ? (
            <div>
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{selectedGroup.name}</h2>
                    {selectedGroup.description && (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                        {selectedGroup.description}
                      </p>
                    )}
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                      ID: {selectedGroup.id}
                    </div>
                  </div>
                  <button
                    className="danger"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                    onClick={() => handleLeave(selectedGroup.id)}
                  >
                    脱退
                  </button>
                </div>
              </div>

              {/* メンバー */}
              <div className="card" style={{ marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  メンバー ({selectedGroup.members.length}人)
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {selectedGroup.members.map((m) => (
                    <div
                      key={m.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.3rem 0.6rem",
                        background: "var(--bg-surface-2)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{m.name}</span>
                      <span className={`badge ${m.role === "owner" ? "blue" : "green"}`} style={{ fontSize: "0.6rem" }}>
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* グループの予定 */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    グループの予定
                  </h3>
                  <button
                    className="primary"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                    onClick={() => setShowAddSchedule(!showAddSchedule)}
                  >
                    {showAddSchedule ? "キャンセル" : "予定を追加"}
                  </button>
                </div>

                <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                  グループの予定は削除できません。個別の予定は各メンバーが自分のカレンダーで管理できます。
                </p>

                {showAddSchedule && (
                  <div style={{ background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", padding: "0.75rem", marginBottom: "1rem" }}>
                    <form onSubmit={handleAddSchedule}>
                      <div className="form-group">
                        <label>タイトル</label>
                        <input
                          type="text"
                          value={scheduleForm.title}
                          onChange={(e) => setScheduleForm((f) => ({ ...f, title: e.target.value }))}
                          placeholder="例: 定例ミーティング"
                          required
                        />
                      </div>
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>種別</label>
                          <select
                            value={scheduleForm.scheduleType}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, scheduleType: e.target.value as "recurring" | "oneshot" }))}
                          >
                            <option value="recurring">毎週繰り返し</option>
                            <option value="oneshot">特定日のみ</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>曜日</label>
                          <select
                            value={scheduleForm.day}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, day: parseInt(e.target.value) }))}
                          >
                            {DAY_LABELS.map((d, i) => (
                              <option key={i} value={i}>{d}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>時限</label>
                          <select
                            value={scheduleForm.period}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, period: parseInt(e.target.value) }))}
                          >
                            {Array.from({ length: 11 }, (_, i) => (
                              <option key={i} value={i}>{getPeriodLabel(i)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {scheduleForm.scheduleType === "oneshot" && (
                        <div className="form-group">
                          <label>日付</label>
                          <input
                            type="date"
                            value={scheduleForm.date}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, date: e.target.value }))}
                            required
                          />
                        </div>
                      )}
                      <button type="submit" className="primary" style={{ fontSize: "0.8rem" }}>追加</button>
                    </form>
                  </div>
                )}

                {selectedGroup.schedules.length === 0 ? (
                  <div className="empty-state" style={{ padding: "1rem" }}>
                    <p>グループの予定はまだありません</p>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>タイトル</th>
                        <th>種別</th>
                        <th>曜日</th>
                        <th>時限</th>
                        <th>日付</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.schedules.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}>{s.title}</td>
                          <td>
                            <span className={`badge ${s.scheduleType === "recurring" ? "blue" : "orange"}`}>
                              {s.scheduleType === "recurring" ? "毎週" : "単発"}
                            </span>
                          </td>
                          <td>{DAY_LABELS[s.day]}</td>
                          <td>{getPeriodLabel(s.period)}</td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            {s.date || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <p>左のリストからグループを選択してください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
