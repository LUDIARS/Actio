import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";

import { calendarApi, groupApi, myPlanApi } from "../lib/api";
import type { PersonalEvent } from "../lib/api-types";
import { HelpButton } from "../components/HelpOverlay";
import { DAY_LABELS, getPeriodLabel } from "../lib/constants";

interface GoogleCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface GroupSchedule {
  id: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  scheduleType: string;
  groupName: string;
}

interface MyPlanEvent {
  id: string;
  name: string;
  isActive: boolean;
  weeklySchedule: Record<string, Array<{ startTime: string; endTime: string; title: string }>>;
}

// ─── Calendar helpers ──────────────────────────────────────

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // 月曜始まり: 0=月, 6=日
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDayOfWeek(year: number, month: number, day: number): number {
  const d = new Date(year, month, day);
  let dow = d.getDay() - 1;
  if (dow < 0) dow = 6;
  return dow;
}

// ─── Component ──────────────────────────────────────────────

export function Dashboard() {
  const CERNERE_URL = import.meta.env.VITE_CERNERE_URL ?? "http://localhost:8080";
  const googleAuthUrl = `${CERNERE_URL}/auth/google/login?redirect=${encodeURIComponent(window.location.origin)}`;
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalEvent[]>([]);
  const [groupSchedules, setGroupSchedules] = useState<GroupSchedule[]>([]);
  const [myPlans, setMyPlans] = useState<MyPlanEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // カレンダー表示: 今月と来月
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [conflicts, setConflicts] = useState<Array<{
    day: number;
    period: number;
    items: Array<{ type: string; title: string; source: string }>;
  }>>([]);

  const loadData = useCallback(async () => {
    try {
      const logErr = (label: string) => (err: Error) => { console.error(`[Dashboard] ${label}:`, err.message); };
      const [statusRes, eventsRes, conflictsRes, groupsRes, myPlansRes] = await Promise.all([
        calendarApi.getStatus().catch((e: Error) => { logErr("status")(e); return { connected: false, email: "" }; }),
        calendarApi.getPersonalEvents().catch((e: Error) => { logErr("events")(e); return { events: [] }; }),
        calendarApi.getConflicts().catch((e: Error) => { logErr("conflicts")(e); return { conflicts: [] }; }),
        groupApi.listMyGroups().catch((e: Error) => { logErr("groups")(e); return { groups: [] }; }),
        myPlanApi.list().catch((e: Error) => { logErr("plans")(e); return { plans: [] }; }),
      ]);
      setConflicts(conflictsRes.conflicts || []);
      setGoogleConnected(statusRes.connected);
      setGoogleEmail(statusRes.email || "");
      setEvents(eventsRes.events || []);
      setMyPlans((myPlansRes.plans || []).filter((p: MyPlanEvent) => p.isActive));

      // グループの予定を取得
      const groups = groupsRes.groups || [];
      const allGroupSchedules: GroupSchedule[] = [];
      for (const g of groups) {
        try {
          const detail = await groupApi.getGroup(g.id);
          const schedules = detail.group?.schedules || [];
          for (const s of schedules) {
            allGroupSchedules.push({
              ...s,
              groupName: g.name,
            });
          }
        } catch {
          // ignore
        }
      }
      setGroupSchedules(allGroupSchedules);

      // Google連携済みならGoogle Calendarの予定も取得
      if (statusRes.connected) {
        const now = new Date();
        const oneMonthLater = new Date(now);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        try {
          const gcalRes = await calendarApi.getEvents({
            timeMin: now.toISOString(),
            timeMax: oneMonthLater.toISOString(),
          });
          setGoogleEvents(gcalRes.events || []);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadData();
  }, [loadData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 今日の曜日 (0=月)
  const todayDow = (() => {
    let d = today.getDay() - 1;
    if (d < 0) d = 6;
    return d;
  })();

  // 今日のグループ予定
  const todayGroupSchedules = groupSchedules.filter((s) => s.day === todayDow);

  // 今日のマイプラン予定
  const todayMyPlanSlots: Array<{ title: string; startTime: string; endTime: string; planName: string }> = [];
  for (const plan of myPlans) {
    const daySlots = plan.weeklySchedule?.[String(todayDow)] || [];
    for (const slot of daySlots) {
      // マイプランがpersonalEventとして生成済みかチェック（重複排除）
      const alreadyInEvents = events.some(
        (e) => e.planId && e.day === todayDow && e.startTime === slot.startTime
      );
      if (!alreadyInEvents) {
        todayMyPlanSlots.push({
          title: slot.title || plan.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          planName: plan.name,
        });
      }
    }
  }

  // 今日の予定（統合）
  type TodayItem = {
    id: string;
    title: string;
    period: number;
    startTime: string | null;
    endTime: string | null;
    source: "personal" | "group" | "myplan";
    groupName?: string;
  };

  const todayItems: TodayItem[] = [
    ...events
      .filter((e) => e.day === todayDow)
      .map((e) => ({
        id: e.id,
        title: e.title,
        period: e.period,
        startTime: e.startTime,
        endTime: e.endTime,
        source: "personal" as const,
      })),
    ...todayGroupSchedules.map((s) => ({
      id: s.id,
      title: s.title,
      period: s.period,
      startTime: null as string | null,
      endTime: null as string | null,
      source: "group" as const,
      groupName: s.groupName,
    })),
    ...todayMyPlanSlots.map((s, i) => ({
      id: `myplan-${i}`,
      title: s.title,
      period: 0,
      startTime: s.startTime,
      endTime: s.endTime,
      source: "myplan" as const,
    })),
  ];

  todayItems.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return a.period - b.period;
  });

  // カレンダー内の各日付にイベントがあるか
  const getEventsForDate = (year: number, month: number, day: number) => {
    const dow = getDayOfWeek(year, month, day);
    const dateStr = formatDate(new Date(year, month, day));
    const personal = events.filter((e) => e.day === dow);
    const group = groupSchedules.filter((s) => s.day === dow);

    // マイプランのスロット数（personalEventとして生成済みのものは除外）
    let myPlanCount = 0;
    for (const plan of myPlans) {
      const daySlots = plan.weeklySchedule?.[String(dow)] || [];
      for (const slot of daySlots) {
        const alreadyInEvents = events.some(
          (e) => e.planId && e.day === dow && e.startTime === slot.startTime
        );
        if (!alreadyInEvents) myPlanCount++;
      }
    }

    const google = googleEvents.filter((e) => {
      const eDate = e.start ? e.start.slice(0, 10) : "";
      return eDate === dateStr;
    });

    return { personal, google, group, myPlanCount };
  };

  // 月移動
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const weeks = getMonthDays(viewYear, viewMonth);
  const isToday = (day: number | null) => {
    if (!day) return false;
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>Dashboard</h1>
          <HelpButton />
        </div>
        <p>スケジュール管理プラットフォーム</p>
      </div>

      {/* Google連携情報 */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Google連携
        </h3>
        {googleConnected ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="badge green">接続済み</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {googleEmail}
            </span>
            <Link to="/calendar" style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
              カレンダー設定 &rarr;
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="badge red">未接続</span>
            <a
              href={googleAuthUrl}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.35rem 0.75rem",
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: "0.8rem",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
              </svg>
              Googleを接続
            </a>
          </div>
        )}
      </div>

      {/* 今日の予定 */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          今日の予定 ({DAY_LABELS[todayDow]}曜日)
        </h3>
        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>読み込み中...</div>
        ) : todayItems.length === 0 ? (
          <div className="empty-state" style={{ padding: "1rem" }}>
            <p>今日の予定はありません</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {todayItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.5rem",
                  background: "var(--bg-surface-2)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                }}
              >
                <span style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  minWidth: 90,
                }}>
                  {item.startTime && item.endTime
                    ? `${item.startTime}–${item.endTime}`
                    : getPeriodLabel(item.period).split("(")[1]?.replace(")", "") || getPeriodLabel(item.period)}
                </span>
                <span style={{ fontWeight: 500 }}>{item.title}</span>
                {item.source === "group" && item.groupName && (
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    ({item.groupName})
                  </span>
                )}
                <span
                  className={`badge ${
                    item.source === "personal" ? "orange"
                    : item.source === "group" ? "blue"
                    : "green"
                  }`}
                  style={{ fontSize: "0.65rem", marginLeft: "auto" }}
                >
                  {item.source === "personal" ? "個人"
                    : item.source === "group" ? "グループ"
                    : "マイプラン"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Google Calendar 直近のイベント */}
        {googleEvents.length > 0 && (
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <h4 style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              Google Calendar (直近)
            </h4>
            {googleEvents.slice(0, 5).map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.3rem 0.5rem",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <span style={{ minWidth: 90 }}>
                  {evt.start ? new Date(evt.start).toLocaleDateString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
                <span style={{ color: "var(--text)" }}>{evt.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* バッティング警告 */}
      {conflicts.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderLeft: "3px solid var(--red)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1rem" }}>&#x26A0;</span>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--red)" }}>
              バッティング ({conflicts.length}件)
            </h3>
            <Link
              to="/calendar"
              style={{ fontSize: "0.75rem", color: "var(--accent)", marginLeft: "auto" }}
            >
              詳細を見る &rarr;
            </Link>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {conflicts.slice(0, 5).map((c) => (
              <div
                key={`${c.day}-${c.period}`}
                style={{
                  padding: "0.3rem 0.6rem",
                  background: "rgba(248, 81, 73, 0.08)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  border: "1px solid var(--red)",
                }}
              >
                {DAY_LABELS[c.day]} {c.period + 1}限: {c.items.map((item) => item.title).join(" / ")}
              </div>
            ))}
            {conflicts.length > 5 && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "center" }}>
                +{conflicts.length - 5}件
              </span>
            )}
          </div>
        </div>
      )}

      {/* 1か月カレンダー */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            予定カレンダー
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={prevMonth}
              style={{
                padding: "0.2rem 0.5rem",
                fontSize: "0.8rem",
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              &larr;
            </button>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, minWidth: 100, textAlign: "center" }}>
              {viewYear}年{monthNames[viewMonth]}
            </span>
            <button
              onClick={nextMonth}
              style={{
                padding: "0.2rem 0.5rem",
                fontSize: "0.8rem",
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              &rarr;
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 1,
          background: "var(--border)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}>
          {/* Day headers */}
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              style={{
                padding: "0.4rem",
                textAlign: "center",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: "var(--bg-surface-2)",
                color: i >= 5 ? "var(--red)" : "var(--text-muted)",
              }}
            >
              {d}
            </div>
          ))}

          {/* Day cells */}
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              const hasEvents = day ? getEventsForDate(viewYear, viewMonth, day) : null;
              const personalCount = hasEvents?.personal.length || 0;
              const googleCount = hasEvents?.google.length || 0;
              const groupCount = hasEvents?.group.length || 0;
              const myPlanCount = hasEvents?.myPlanCount || 0;
              const isTodayCell = isToday(day);

              return (
                <div
                  key={`${wi}-${di}`}
                  style={{
                    padding: "0.3rem",
                    minHeight: 60,
                    background: isTodayCell ? "rgba(56, 139, 253, 0.08)" : "var(--bg-surface)",
                    position: "relative",
                  }}
                >
                  {day && (
                    <>
                      <div style={{
                        fontSize: "0.75rem",
                        fontWeight: isTodayCell ? 700 : 400,
                        color: isTodayCell ? "var(--accent)" : di >= 5 ? "var(--red)" : "var(--text)",
                        marginBottom: "0.2rem",
                      }}>
                        {day}
                      </div>
                      {personalCount > 0 && (
                        <div style={{
                          fontSize: "0.6rem",
                          background: "var(--accent)",
                          color: "#000",
                          borderRadius: 2,
                          padding: "0.1rem 0.3rem",
                          marginBottom: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {personalCount}件
                        </div>
                      )}
                      {groupCount > 0 && (
                        <div style={{
                          fontSize: "0.6rem",
                          background: "#3B82F6",
                          color: "#fff",
                          borderRadius: 2,
                          padding: "0.1rem 0.3rem",
                          marginBottom: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          G:{groupCount}
                        </div>
                      )}
                      {myPlanCount > 0 && (
                        <div style={{
                          fontSize: "0.6rem",
                          background: "var(--green)",
                          color: "#fff",
                          borderRadius: 2,
                          padding: "0.1rem 0.3rem",
                          marginBottom: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          MP:{myPlanCount}
                        </div>
                      )}
                      {googleCount > 0 && (
                        <div style={{
                          fontSize: "0.6rem",
                          background: "#4285F4",
                          color: "#fff",
                          borderRadius: 2,
                          padding: "0.1rem 0.3rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          GCal:{googleCount}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.7rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--accent)" }} />
            個人予定
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#3B82F6" }} />
            グループ予定
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--green)" }} />
            マイプラン
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#4285F4" }} />
            Googleカレンダー
          </span>
        </div>
      </div>

      {/* クイックアクセス */}
      <Link
        to="/my-plan"
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginTop: "1rem",
          padding: "0.75rem 1rem",
          borderLeft: "3px solid var(--green)",
          textDecoration: "none",
          color: "inherit",
          transition: "transform 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "translateX(4px)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
      >
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>マイプラン</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>週間ルーティーン設定</div>
        </div>
      </Link>
    </div>
  );
}
