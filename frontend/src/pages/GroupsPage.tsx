import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { groupApi } from "../lib/api";
import { useWsEvents } from "../hooks/useWsEvent";
import { HelpButton } from "../components/HelpOverlay";
import { DAY_LABELS, getPeriodLabel } from "../lib/constants";

interface Group {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  role: string;
  createdAt: string;
}

interface GroupEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  endDate: string | null;
  allDay: boolean;
  period: number | null;
  duration: number | null;
  eventType: string;
}

interface GroupMember {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  enabledModules: string[];
  members: GroupMember[];
  schedules: Array<{
    id: string;
    title: string;
    day: number;
    period: number;
    duration: number;
    date: string | null;
    scheduleType: string;
  }>;
  events: GroupEvent[];
}

interface SearchUser {
  id: string;
  name: string;
  email: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "オーナー",
  leader: "リーダー",
  member: "一般",
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  owner: "blue",
  leader: "orange",
  member: "green",
};

interface ModuleInfo {
  id: string;
  name: string;
  codename: string | null;
  description: string;
  category: "education" | "project" | "communication" | "utility";
}

const AVAILABLE_MODULES: ModuleInfo[] = [
  { id: "calicula", name: "CALICULA", codename: "M1", description: "学校カリキュラム管理", category: "education" },
  { id: "pm", name: "PM", codename: "M2", description: "プロジェクト管理 (GitHub/Notion)", category: "project" },
  { id: "machina", name: "MACHINA", codename: "M3", description: "タスク自動生成 (Slack/Discord)", category: "project" },
  { id: "notification", name: "通知・Webhook", codename: null, description: "Slack/Discord/LINE 通知", category: "communication" },
  { id: "voting", name: "日程調整Voting", codename: null, description: "投票で日程を決定", category: "communication" },
  { id: "holiday", name: "休日管理", codename: null, description: "祝日・休業期間管理", category: "utility" },
  { id: "facility-booking", name: "施設予約", codename: null, description: "教室・会議室の予約", category: "education" },
  { id: "integrations", name: "外部サービス連携", codename: null, description: "Google Calendar/Notion 同期", category: "utility" },
];

const CATEGORY_LABELS: Record<string, string> = {
  education: "教育",
  project: "プロジェクト",
  communication: "コミュニケーション",
  utility: "ユーティリティ",
};

const CATEGORY_COLORS: Record<string, string> = {
  education: "blue",
  project: "orange",
  communication: "green",
  utility: "purple",
};

export function GroupsPage() {
  const { user: currentUser } = useAuth();
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
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    date: "",
    endDate: "",
    eventType: "event" as string,
    description: "",
  });

  // 招待関連
  const [showInvite, setShowInvite] = useState(false);
  const [allUsers, setAllUsers] = useState<SearchUser[]>([]);
  const [inviteFilter, setInviteFilter] = useState("");
  const [inviting, setInviting] = useState(false);

  // モジュール設定
  const [showModules, setShowModules] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);

  // 現在のユーザのグループ内ロール
  const myGroupRole =
    selectedGroup?.members.find((m) => m.userId === currentUser?.id)?.role || "";
  const isSystemAdmin = currentUser?.role === "admin";
  const canManage =
    isSystemAdmin || myGroupRole === "owner" || myGroupRole === "leader";

  const fetchGroups = useCallback(async () => {
    try {
      const data = await groupApi.listMyGroups();
      setGroups(data.groups || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // WS リアルタイム通知: グループ変更時に自動リフレッシュ
  useWsEvents(
    [
      "group.member_joined", "group.member_left", "group.member_invited",
      "group.event_created", "group.event_updated", "group.event_deleted",
      "group.schedule_created",
    ],
    useCallback((payload) => {
      const gid = payload.groupId as string;
      fetchGroups();
      if (selectedGroupId && gid === selectedGroupId) {
        loadGroupDetail(gid);
      }
    }, [fetchGroups, selectedGroupId]),
  );

  const handleJoin = async () => {
    setError("");
    if (!joinGroupId.trim()) return;
    try {
      await groupApi.joinGroup(joinGroupId.trim());
      setJoinGroupId("");
      await loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLeave = async (groupId: string) => {
    if (!confirm("このグループから脱退しますか？")) return;
    try {
      await groupApi.leaveGroup(groupId);
      setSelectedGroup(null);
      setSelectedGroupId("");
      await loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setError("");
    try {
      await groupApi.addEvent(selectedGroup.id, {
        title: eventForm.title,
        date: eventForm.date,
        endDate: eventForm.endDate || undefined,
        eventType: eventForm.eventType,
        description: eventForm.description || undefined,
      });
      setShowAddEvent(false);
      setEventForm({ title: "", date: "", endDate: "", eventType: "event", description: "" });
      await loadGroupDetail(selectedGroup.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!selectedGroup) return;
    if (!confirm("この予定を削除しますか？")) return;
    try {
      await groupApi.deleteEvent(selectedGroup.id, eventId);
      await loadGroupDetail(selectedGroup.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleModule = async (moduleId: string) => {
    if (!selectedGroup) return;
    setModuleSaving(true);
    try {
      const current = selectedGroup.enabledModules || [];
      const updated = current.includes(moduleId)
        ? current.filter((m: string) => m !== moduleId)
        : [...current, moduleId];
      await groupApi.updateModules(selectedGroup.id, updated);
      setSelectedGroup({ ...selectedGroup, enabledModules: updated });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setModuleSaving(false);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // 招待: ユーザ一覧を取得
  const openInviteDialog = async () => {
    setShowInvite(true);
    setInviteFilter("");
    try {
      const data = await groupApi.searchUsers();
      setAllUsers(data.users || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleInvite = async (targetUserId: string) => {
    if (!selectedGroup) return;
    setInviting(true);
    setError("");
    try {
      await groupApi.inviteMember(selectedGroup.id, targetUserId);
      await loadGroupDetail(selectedGroup.id);
      // 招待済みユーザを一覧から除外するため再取得
      const data = await groupApi.searchUsers();
      setAllUsers(data.users || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setInviting(false);
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (!selectedGroup) return;
    setError("");
    try {
      await groupApi.updateMemberRole(selectedGroup.id, targetUserId, newRole);
      await loadGroupDetail(selectedGroup.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // 招待候補: 既にメンバーでないユーザのみ表示
  const memberUserIds = new Set(selectedGroup?.members.map((m) => m.userId) || []);
  const filteredUsers = allUsers
    .filter((u) => !memberUserIds.has(u.id))
    .filter(
      (u) =>
        !inviteFilter ||
        u.name.toLowerCase().includes(inviteFilter.toLowerCase()) ||
        u.email.toLowerCase().includes(inviteFilter.toLowerCase())
    );

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>グループ</h1>
          <HelpButton />
        </div>
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
                {g.name} ({g.memberCount}人 / {ROLE_LABELS[g.role] || g.role})
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

          {/* グループの個別予定 (日付ベース) */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                個別予定 (学校行事・休日等)
              </h3>
              <button
                className="primary"
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() => setShowAddEvent(!showAddEvent)}
              >
                {showAddEvent ? "キャンセル" : "予定を追加"}
              </button>
            </div>

            {showAddEvent && (
              <div style={{ background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", padding: "0.75rem", marginBottom: "1rem" }}>
                <form onSubmit={handleAddEvent}>
                  <div className="form-group">
                    <label>タイトル</label>
                    <input
                      type="text"
                      value={eventForm.title}
                      onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="例: 前期審査会, 創立記念日"
                      required
                    />
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: "1 1 120px" }}>
                      <label>種別</label>
                      <select
                        value={eventForm.eventType}
                        onChange={(e) => setEventForm((f) => ({ ...f, eventType: e.target.value }))}
                      >
                        <option value="event">行事</option>
                        <option value="holiday">休日</option>
                        <option value="examination_period">審査会期間</option>
                        <option value="custom">その他</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: "1 1 120px" }}>
                      <label>開始日</label>
                      <input
                        type="date"
                        value={eventForm.date}
                        onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ flex: "1 1 120px" }}>
                      <label>終了日 (期間の場合)</label>
                      <input
                        type="date"
                        value={eventForm.endDate}
                        onChange={(e) => setEventForm((f) => ({ ...f, endDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>説明 (任意)</label>
                    <input
                      type="text"
                      value={eventForm.description}
                      onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="補足情報"
                    />
                  </div>
                  <button type="submit" className="primary" style={{ fontSize: "0.8rem" }}>追加</button>
                </form>
              </div>
            )}

            {(!selectedGroup.events || selectedGroup.events.length === 0) ? (
              <div className="empty-state" style={{ padding: "1rem" }}>
                <p>個別予定はまだありません</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {selectedGroup.events.map((ev) => (
                  <div
                    key={ev.id}
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
                    <span style={{ fontWeight: 500, flex: "1 1 auto", minWidth: 0 }}>{ev.title}</span>
                    <span className={`badge ${ev.eventType === "holiday" ? "red" : ev.eventType === "examination_period" ? "orange" : "blue"}`} style={{ fontSize: "0.65rem" }}>
                      {ev.eventType === "holiday" ? "休日" : ev.eventType === "examination_period" ? "審査会" : ev.eventType === "event" ? "行事" : "他"}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {ev.date}{ev.endDate && ev.endDate !== ev.date ? ` ~ ${ev.endDate}` : ""}
                    </span>
                    <button
                      className="danger"
                      style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem" }}
                      onClick={() => handleDeleteEvent(ev.id)}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* モジュール設定 */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                使用モジュール
              </h3>
              <button
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() => setShowModules(!showModules)}
              >
                {showModules ? "閉じる" : "設定"}
              </button>
            </div>

            {/* 有効モジュールのサマリー */}
            {!showModules && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {(selectedGroup.enabledModules || []).length === 0 ? (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>モジュール未設定</span>
                ) : (
                  (selectedGroup.enabledModules || []).map((mId: string) => {
                    const mod = AVAILABLE_MODULES.find((m) => m.id === mId);
                    return mod ? (
                      <span key={mId} className={`badge ${CATEGORY_COLORS[mod.category] || "green"}`} style={{ fontSize: "0.65rem" }}>
                        {mod.codename ? `${mod.codename}: ` : ""}{mod.name}
                      </span>
                    ) : null;
                  })
                )}
              </div>
            )}

            {/* モジュール選択パネル */}
            {showModules && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {(["education", "project", "communication", "utility"] as const).map((cat) => {
                  const mods = AVAILABLE_MODULES.filter((m) => m.category === cat);
                  if (mods.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase" }}>
                        {CATEGORY_LABELS[cat]}
                      </div>
                      {mods.map((mod) => {
                        const enabled = (selectedGroup.enabledModules || []).includes(mod.id);
                        return (
                          <label
                            key={mod.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.4rem 0.6rem",
                              background: enabled ? "var(--bg-surface-2)" : "transparent",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "0.8rem",
                              cursor: canManage ? "pointer" : "default",
                              opacity: moduleSaving ? 0.6 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => handleToggleModule(mod.id)}
                              disabled={!canManage || moduleSaving}
                              style={{ margin: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 500 }}>
                                {mod.codename ? `${mod.codename}: ` : ""}{mod.name}
                              </span>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                {mod.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
                {!canManage && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                    モジュールの変更はオーナーまたはリーダーのみ可能です
                  </div>
                )}
              </div>
            )}
          </div>

          {/* メンバー */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                メンバー ({selectedGroup.members.length}人)
              </h3>
              {canManage && (
                <button
                  className="primary"
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  onClick={() => (showInvite ? setShowInvite(false) : openInviteDialog())}
                >
                  {showInvite ? "閉じる" : "メンバーを招待"}
                </button>
              )}
            </div>

            {/* 招待パネル */}
            {showInvite && (
              <div style={{ background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", padding: "0.75rem", marginBottom: "1rem" }}>
                <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                  <input
                    type="text"
                    value={inviteFilter}
                    onChange={(e) => setInviteFilter(e.target.value)}
                    placeholder="名前またはメールで検索..."
                    style={{ fontSize: "0.8rem" }}
                  />
                </div>
                {filteredUsers.length === 0 ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    招待可能なユーザが見つかりません
                  </div>
                ) : (
                  <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          padding: "0.3rem 0.5rem",
                          background: "var(--bg-surface)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.8rem",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{u.name}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{u.email}</div>
                        </div>
                        <button
                          className="primary"
                          style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem", whiteSpace: "nowrap" }}
                          onClick={() => handleInvite(u.id)}
                          disabled={inviting}
                        >
                          招待
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {selectedGroup.members.map((m) => (
                <div
                  key={m.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.6rem",
                    background: "var(--bg-surface-2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.8rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontWeight: 500, flex: "1 1 auto", minWidth: 0 }}>
                    {m.name}
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "0.4rem" }}>
                      {m.email}
                    </span>
                  </span>
                  <span
                    className={`badge ${ROLE_BADGE_CLASS[m.role] || "green"}`}
                    style={{ fontSize: "0.6rem" }}
                  >
                    {ROLE_LABELS[m.role] || m.role}
                  </span>
                  {/* ロール変更ドロップダウン: owner以外かつ管理権限がある場合 */}
                  {canManage && m.role !== "owner" && m.userId !== currentUser?.id && (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                      style={{ fontSize: "0.7rem", padding: "0.1rem 0.2rem", width: "auto" }}
                    >
                      <option value="leader">リーダー</option>
                      <option value="member">一般</option>
                    </select>
                  )}
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
