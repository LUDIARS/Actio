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
  useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    day: 0,
    period: 0,
    duration: 1,
    scheduleType: "recurring" as "recurring" | "oneshot",
    date: "",
  });
  const [joinGroupId, setJoinGroupId] = useState("");

  const fetchGroups = useCallback(async () => {
    try {
      const data = await groupApi.listMyGroups();
      setGroups(data.groups || []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadGroups = useCallback(async () => {
    setLoading(true);
    return fetchGroups();
  }, [fetchGroups]);

  const loadGroupDetail = async (groupId: string) => {
    if (!groupId) {
      setSelectedGroup(null);
      setSelectedGroupId("");
      return;
    }
    try {
      setSelectedGroupId(groupId);
      const data = await groupApi.getGroup(groupId);
      setSelectedGroup(data.group || null);
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
      setSelectedGroupId("");
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
        <p>グループごとの予定を管理できます</p>
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

      {/* グループ選択プルダウン */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedGroupId}
            onChange={(e) => loadGroupDetail(e.target.value)}
            style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}
          >
            <option value="">グループを選択...</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.memberCount}人 / {g.role})
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              value={joinGroupId}
              onChange={(e) => setJoinGroupId(e.target.value)}
              placeholder="IDで参加"
              style={{ fontSize: "0.8rem", width: 120 }}
            />
            <button onClick={handleJoin} style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>参加</button>
          </div>
        </div>
        {loading && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>読み込み中...</div>
        )}
      </div>

      {/* 選択されたグループの詳細 */}
      {selectedGroup ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* グループヘッダ */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
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

          {/* グループの予定 */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
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
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: "1 1 100px" }}>
                      <label>種別</label>
                      <select
                        value={scheduleForm.scheduleType}
                        onChange={(e) => setScheduleForm((f) => ({ ...f, scheduleType: e.target.value as "recurring" | "oneshot" }))}
                      >
                        <option value="recurring">毎週繰り返し</option>
                        <option value="oneshot">特定日のみ</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: "1 1 80px" }}>
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
                    <div className="form-group" style={{ flex: "1 1 100px" }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {selectedGroup.schedules.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.6rem",
                      background: "var(--bg-surface-2)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 500, flex: "1 1 auto", minWidth: 0 }}>{s.title}</span>
                    <span className={`badge ${s.scheduleType === "recurring" ? "blue" : "orange"}`} style={{ fontSize: "0.65rem" }}>
                      {s.scheduleType === "recurring" ? "毎週" : "単発"}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {DAY_LABELS[s.day]} {getPeriodLabel(s.period)}
                    </span>
                    {s.date && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.date}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* メンバー */}
          <div className="card">
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
        </div>
      ) : !loading && groups.length > 0 ? (
        <div className="empty-state" style={{ padding: "2rem" }}>
          <p>上のプルダウンからグループを選択してください</p>
        </div>
      ) : !loading && groups.length === 0 ? (
        <div className="empty-state" style={{ padding: "2rem" }}>
          <p>グループに未参加です。グループIDで参加するか、管理者にグループ作成を依頼してください。</p>
        </div>
      ) : null}
    </div>
  );
}
