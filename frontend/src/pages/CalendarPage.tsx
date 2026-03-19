import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { calendarApi } from "../lib/api";
import { HelpButton } from "../components/HelpOverlay";
import { DAY_LABELS, getPeriodLabel } from "../lib/constants";

type Tab = "events" | "plans" | "google" | "conflicts";

interface PersonalEvent {
  id: string;
  title: string;
  description: string | null;
  day: number;
  period: number;
  duration: number;
  eventType: string;
  planId: string | null;
  isPrivate: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  days: number[];
  startPeriod: number;
  duration: number;
  eventType: string;
  isPrivate: boolean;
  isActive: boolean;
}

export function CalendarPage() {
  const { googleAuthUrl } = useAuth();
  const [tab, setTab] = useState<Tab>("events");
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<Array<{
    day: number;
    period: number;
    items: Array<{ type: string; title: string; source: string }>;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 手動予定フォーム
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    day: 0,
    period: 0,
    eventType: "personal",
    isPrivate: true,
  });

  // プランフォーム
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: "",
    description: "",
    days: [] as number[],
    startPeriod: 0,
    duration: 1,
    eventType: "personal",
    isPrivate: true,
  });

  const loadEvents = useCallback(async () => {
    try {
      const data = await calendarApi.getPersonalEvents();
      setEvents(data.events || []);
    } catch (err) {
      console.error("[CalendarPage] loadEvents失敗:", err);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const data = await calendarApi.getPlans();
      setPlans(data.plans || []);
    } catch (err) {
      console.error("[CalendarPage] loadPlans失敗:", err);
    }
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    try {
      const data = await calendarApi.getStatus();
      setGoogleConnected(data.connected);
    } catch (err) {
      console.error("[CalendarPage] loadGoogleStatus失敗:", err);
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      const data = await calendarApi.getConflicts();
      setConflicts(data.conflicts || []);
    } catch (err) {
      console.error("[CalendarPage] loadConflicts失敗:", err);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    loadPlans();
    loadGoogleStatus();
    loadConflicts();
  }, [loadEvents, loadPlans, loadGoogleStatus, loadConflicts]);

  const loadGoogleEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await calendarApi.getEvents();
      setGoogleEvents(data.events || []);
    } catch (err: any) {
      console.error("[CalendarPage] loadGoogleEvents失敗:", err);
      setError(err.message || "Googleカレンダーの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // 手動予定追加
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await calendarApi.createPersonalEvent(eventForm);
      setShowEventForm(false);
      setEventForm({ title: "", description: "", day: 0, period: 0, eventType: "personal", isPrivate: true });
      await loadEvents();
    } catch (err: any) {
      console.error("[CalendarPage] handleAddEvent失敗:", err);
      setError(err.message || "予定の追加に失敗しました");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await calendarApi.deletePersonalEvent(id);
      await loadEvents();
    } catch (err: any) {
      console.error("[CalendarPage] handleDeleteEvent失敗:", err);
      setError(err.message);
    }
  };

  // プラン追加
  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (planForm.days.length === 0) {
      setError("曜日を1つ以上選択してください");
      return;
    }
    try {
      await calendarApi.createPlan(planForm);
      setShowPlanForm(false);
      setPlanForm({ name: "", description: "", days: [], startPeriod: 0, duration: 1, eventType: "personal", isPrivate: true });
      await loadPlans();
      await loadEvents();
    } catch (err: any) {
      console.error("[CalendarPage] handleAddPlan失敗:", err);
      setError(err.message || "プランの作成に失敗しました");
    }
  };

  const handleDeletePlan = async (id: string) => {
    try {
      await calendarApi.deletePlan(id);
      await loadPlans();
      await loadEvents();
    } catch (err: any) {
      console.error("[CalendarPage] handleDeletePlan失敗:", err);
      setError(err.message);
    }
  };

  const handleTogglePlan = async (plan: Plan) => {
    try {
      await calendarApi.updatePlan(plan.id, { isActive: !plan.isActive });
      await loadPlans();
      await loadEvents();
    } catch (err: any) {
      console.error("[CalendarPage] handleTogglePlan失敗:", err);
      setError(err.message);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await calendarApi.disconnect();
      setGoogleConnected(false);
      setGoogleEvents([]);
    } catch (err: any) {
      console.error("[CalendarPage] handleDisconnectGoogle失敗:", err);
      setError(err.message);
    }
  };

  const togglePlanDay = (day: number) => {
    setPlanForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day].sort(),
    }));
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>カレンダー・予定管理</h1>
          <HelpButton />
        </div>
        <p>手動で予定を追加、プランで自動生成、またはGoogleカレンダーと連携</p>
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

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        {([
          { key: "events", label: "手動予定" },
          { key: "plans", label: "プラン" },
          { key: "google", label: "Googleカレンダー" },
          { key: "conflicts", label: `バッティング${conflicts.length > 0 ? ` (${conflicts.length})` : ""}` },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── 手動予定タブ ─── */}
      {tab === "events" && (
        <div>
          <div className="toolbar">
            <button className="primary" onClick={() => setShowEventForm(!showEventForm)}>
              {showEventForm ? "キャンセル" : "予定を追加"}
            </button>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {events.length}件の予定
            </span>
          </div>

          {showEventForm && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <form onSubmit={handleAddEvent}>
                <div className="form-group">
                  <label>タイトル</label>
                  <input
                    type="text"
                    value={eventForm.title}
                    onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="例: 自習、バイト、ミーティング"
                    required
                  />
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>曜日</label>
                    <select
                      value={eventForm.day}
                      onChange={(e) => setEventForm((f) => ({ ...f, day: parseInt(e.target.value) }))}
                    >
                      {DAY_LABELS.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>時限</label>
                    <select
                      value={eventForm.period}
                      onChange={(e) => setEventForm((f) => ({ ...f, period: parseInt(e.target.value) }))}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i} value={i}>{getPeriodLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>種別</label>
                  <select
                    value={eventForm.eventType}
                    onChange={(e) => setEventForm((f) => ({ ...f, eventType: e.target.value }))}
                  >
                    <option value="personal">個人予定</option>
                    <option value="event">学校イベント</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={eventForm.isPrivate}
                      onChange={(e) => setEventForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                      style={{ width: "auto", marginRight: "0.5rem" }}
                    />
                    非公開
                  </label>
                </div>
                <button type="submit" className="primary">追加</button>
              </form>
            </div>
          )}

          {events.length === 0 ? (
            <div className="empty-state">
              <p>予定がありません</p>
              <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                上の「予定を追加」ボタンか、「プラン」タブで繰り返し予定を設定できます
              </p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th>曜日</th>
                  <th>時限</th>
                  <th>種別</th>
                  <th>ソース</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id}>
                    <td style={{ fontWeight: 500 }}>{evt.title}</td>
                    <td>{DAY_LABELS[evt.day]}</td>
                    <td>{getPeriodLabel(evt.period)}</td>
                    <td>
                      <span className={`badge ${evt.eventType === "personal" ? "orange" : "purple"}`}>
                        {evt.eventType === "personal" ? "個人" : "イベント"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {evt.planId ? "プラン" : "手動"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="danger"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => handleDeleteEvent(evt.id)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── プランタブ ─── */}
      {tab === "plans" && (
        <div>
          <div className="toolbar">
            <button className="primary" onClick={() => setShowPlanForm(!showPlanForm)}>
              {showPlanForm ? "キャンセル" : "プランを作成"}
            </button>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {plans.length}件のプラン
            </span>
          </div>

          {showPlanForm && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <form onSubmit={handleAddPlan}>
                <div className="form-group">
                  <label>プラン名</label>
                  <input
                    type="text"
                    value={planForm.name}
                    onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例: 毎日の自習時間、週3バイト"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>曜日 (複数選択)</label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {DAY_LABELS.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => togglePlanDay(i)}
                        style={{
                          padding: "0.3rem 0.75rem",
                          fontSize: "0.8rem",
                          background: planForm.days.includes(i) ? "var(--accent)" : "var(--bg-surface-2)",
                          color: planForm.days.includes(i) ? "#000" : "var(--text)",
                          border: `1px solid ${planForm.days.includes(i) ? "var(--accent)" : "var(--border)"}`,
                          borderRadius: "var(--radius-sm)",
                          fontWeight: planForm.days.includes(i) ? 600 : 400,
                          cursor: "pointer",
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>開始時限</label>
                    <select
                      value={planForm.startPeriod}
                      onChange={(e) => setPlanForm((f) => ({ ...f, startPeriod: parseInt(e.target.value) }))}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i} value={i}>{getPeriodLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>コマ数</label>
                    <select
                      value={planForm.duration}
                      onChange={(e) => setPlanForm((f) => ({ ...f, duration: parseInt(e.target.value) }))}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n}コマ</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>種別</label>
                  <select
                    value={planForm.eventType}
                    onChange={(e) => setPlanForm((f) => ({ ...f, eventType: e.target.value }))}
                  >
                    <option value="personal">個人予定</option>
                    <option value="event">学校イベント</option>
                  </select>
                </div>
                <button type="submit" className="primary">プラン作成</button>
              </form>
            </div>
          )}

          {plans.length === 0 ? (
            <div className="empty-state">
              <p>プランがありません</p>
              <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                プランを作成すると、選択した曜日・時限に自動で予定が生成されます
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {plans.map((plan) => (
                <div key={plan.id} className="card" style={{ opacity: plan.isActive ? 1 : 0.5 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>{plan.name}</h3>
                      <span className={`badge ${plan.isActive ? "green" : "red"}`}>
                        {plan.isActive ? "有効" : "無効"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => handleTogglePlan(plan)}
                      >
                        {plan.isActive ? "無効化" : "有効化"}
                      </button>
                      <button
                        className="danger"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <span>曜日: {(plan.days as number[]).map((d) => DAY_LABELS[d]).join("・")}</span>
                    <span style={{ marginLeft: "1rem" }}>
                      時限: {getPeriodLabel(plan.startPeriod)}
                      {plan.duration > 1 ? ` 〜 ${plan.duration}コマ` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── バッティングタブ ─── */}
      {tab === "conflicts" && (
        <div>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              バッティング検出
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              個人の予定とグループの予定が重複している箇所です。バッティングマークが表示され、予定を確認している他の人にもわかるようになっています。
            </p>
            <button onClick={loadConflicts} style={{ fontSize: "0.8rem" }}>再チェック</button>
          </div>

          {conflicts.length === 0 ? (
            <div className="empty-state">
              <p>バッティングはありません</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {conflicts.map((conflict, i) => (
                <div
                  key={i}
                  className="card"
                  style={{
                    borderLeft: "3px solid var(--red)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "1.2rem" }}>&#x26A0;</span>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                      {DAY_LABELS[conflict.day]} {getPeriodLabel(conflict.period)}
                    </span>
                    <span className="badge red" style={{ fontSize: "0.65rem" }}>
                      {conflict.items.length}件重複
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {conflict.items.map((item, j) => (
                      <div
                        key={j}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.3rem 0.5rem",
                          background: "var(--bg-surface-2)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.8rem",
                        }}
                      >
                        <span className={`badge ${item.type === "personal" ? "orange" : "blue"}`} style={{ fontSize: "0.6rem" }}>
                          {item.type === "personal" ? "個人" : "グループ"}
                        </span>
                        <span style={{ fontWeight: 500 }}>{item.title}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: "auto" }}>
                          {item.source}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Googleカレンダータブ ─── */}
      {tab === "google" && (
        <div>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Googleカレンダー連携
            </h3>
            {googleConnected ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                  <span className="badge green">接続済み</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Googleカレンダーの予定を読み取れます
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="primary" onClick={loadGoogleEvents} disabled={loading}>
                    {loading ? "読み込み中..." : "予定を取得"}
                  </button>
                  <button className="danger" onClick={handleDisconnectGoogle}>
                    連携を解除
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  Googleカレンダーと連携すると、既存の予定を自動で読み込めます。
                  連携は任意です。手動で予定を追加することもできます。
                </p>
                <a
                  href={googleAuthUrl}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text)",
                    fontSize: "0.85rem",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                  </svg>
                  Googleカレンダーを接続
                </a>
              </div>
            )}
          </div>

          {googleEvents.length > 0 && (
            <div>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                Googleカレンダーの予定 ({googleEvents.length}件)
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>タイトル</th>
                    <th>開始</th>
                    <th>終了</th>
                  </tr>
                </thead>
                <tbody>
                  {googleEvents.map((evt: any) => (
                    <tr key={evt.id}>
                      <td style={{ fontWeight: 500 }}>{evt.title}</td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {evt.start ? new Date(evt.start).toLocaleString("ja-JP") : "-"}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {evt.end ? new Date(evt.end).toLocaleString("ja-JP") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
