import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DAY_LABELS } from "../lib/constants";
import { facilityBooking, groupApi } from "../lib/api";
import { useWsEvents } from "../hooks/useWsEvent";

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
  calendarEventId?: string;
}

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

interface GroupMember {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface RoomAvailability {
  id: string;
  name: string;
  capacity: number;
  type: string;
  freeSlots: Array<{ day: number; period: number }>;
  occupiedCount: number;
}

interface GroupSchedule {
  id: string;
  day: number;
  period: number;
  duration: number;
  title: string;
}

type SlotMode = "auto" | "manual";

export function FacilityBookingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showForm, setShowForm] = useState(searchParams.has("day") || false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [participantSelection, setParticipantSelection] = useState<Map<string, boolean>>(new Map());
  const [groupSchedules, setGroupSchedules] = useState<GroupSchedule[]>([]);

  const [roomsAvailability, setRoomsAvailability] = useState<RoomAvailability[]>([]);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [allGroups, setAllGroups] = useState<GroupInfo[]>([]);
  const [participantGroupIds, setParticipantGroupIds] = useState<string[]>([]);

  const [slotMode, setSlotMode] = useState<SlotMode>("auto");

  const [form, setForm] = useState({
    groupId: searchParams.get("groupId") || "",
    title: "",
    day: parseInt(searchParams.get("day") || "0", 10),
    period: parseInt(searchParams.get("period") || "0", 10),
    roomId: searchParams.get("roomId") || "",
    roomName: "",
    note: "",
  });

  const showMsg = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const fetchReservations = useCallback(async () => {
    try {
      const result = await facilityBooking.listReservations();
      setReservations(result.reservations || []);
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, "error");
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await groupApi.listMyGroups();
      setGroups(res.groups || []);
      setAllGroups(res.groups || []);
    } catch { /* ignore */ }
  }, []);

  const fetchRoomsAvailability = useCallback(async () => {
    try {
      const res = await facilityBooking.getRoomsAvailability();
      setRoomsAvailability(res.rooms || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchReservations();
    fetchGroups();
    fetchRoomsAvailability();
  }, [fetchReservations, fetchGroups, fetchRoomsAvailability]);

  // WS リアルタイム通知: 予約変更時に自動リフレッシュ
  useWsEvents(
    ["facility.reservation_created", "facility.reservation_updated", "facility.reservation_cancelled"],
    useCallback(() => {
      fetchReservations();
      fetchRoomsAvailability();
    }, [fetchReservations, fetchRoomsAvailability]),
  );

  useEffect(() => {
    if (!form.groupId) {
      setMembers([]);
      setParticipantSelection(new Map());
      setGroupSchedules([]);
      return;
    }
    (async () => {
      try {
        const res = await groupApi.getGroup(form.groupId);
        const m = res.group?.members || [];
        setMembers(m);
        const sel = new Map<string, boolean>();
        for (const member of m) {
          sel.set(member.userId, true);
        }
        setParticipantSelection(sel);
        setGroupSchedules(res.group?.schedules || []);
      } catch {
        setMembers([]);
        setParticipantSelection(new Map());
        setGroupSchedules([]);
      }
    })();
  }, [form.groupId]);

  const getMemberConflicts = useCallback((userId: string): string[] => {
    const conflicts: string[] = [];
    for (const sched of groupSchedules) {
      if (sched.day === form.day) {
        for (let p = sched.period; p < sched.period + sched.duration; p++) {
          if (p === form.period) {
            conflicts.push(sched.title);
          }
        }
      }
    }
    for (const r of reservations) {
      if (r.status !== "confirmed") continue;
      if (r.day === form.day && r.period === form.period) {
        if (r.participants.includes(userId)) {
          conflicts.push(`予約: ${r.title}`);
        }
      }
    }
    return conflicts;
  }, [form.day, form.period, groupSchedules, reservations]);

  const autoSlotCandidates = useCallback((): Array<{ day: number; period: number; freeRooms: RoomAvailability[] }> => {
    const selectedParticipants = Array.from(participantSelection.entries())
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (selectedParticipants.length === 0) return [];

    const candidates: Array<{ day: number; period: number; freeRooms: RoomAvailability[] }> = [];

    for (let d = 0; d < 7; d++) {
      for (let p = 0; p < 11; p++) {
        let allFree = true;
        for (const userId of selectedParticipants) {
          for (const sched of groupSchedules) {
            if (sched.day === d) {
              for (let sp = sched.period; sp < sched.period + sched.duration; sp++) {
                if (sp === p) { allFree = false; break; }
              }
            }
            if (!allFree) break;
          }
          if (!allFree) break;
          for (const r of reservations) {
            if (r.status !== "confirmed") continue;
            if (r.day === d && r.period === p && r.participants.includes(userId)) {
              allFree = false;
              break;
            }
          }
          if (!allFree) break;
        }
        if (!allFree) continue;

        const freeRooms = roomsAvailability.filter((room) =>
          room.freeSlots.some((s) => s.day === d && s.period === p)
        );
        if (freeRooms.length > 0) {
          candidates.push({ day: d, period: p, freeRooms });
        }
      }
    }
    return candidates;
  }, [participantSelection, groupSchedules, reservations, roomsAvailability]);

  const handleCreate = async () => {
    if (!form.groupId || !form.title || !form.roomId) {
      showMsg("グループ、タイトル、教室を指定してください", "error");
      return;
    }
    setLoading(true);
    try {
      const participants = Array.from(participantSelection.entries())
        .filter(([, v]) => v)
        .map(([k]) => k);

      await facilityBooking.createReservation({
        groupId: form.groupId,
        title: form.title,
        day: form.day,
        period: form.period,
        roomId: form.roomId,
        participants,
        participantGroupIds: participantGroupIds.length > 0 ? participantGroupIds : undefined,
        note: form.note,
      });
      showMsg("予約を作成しました（カレンダーに自動登録済み）");
      setShowForm(false);
      fetchReservations();
      fetchRoomsAvailability();
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, "error");
    }
    setLoading(false);
  };

  const handleCancel = async (id: string) => {
    try {
      await facilityBooking.cancelReservation(id);
      showMsg("予約をキャンセルしました（カレンダーから削除済み）");
      fetchReservations();
      fetchRoomsAvailability();
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, "error");
    }
  };

  const statusBadge = (status: string) => {
    const cls = status === "confirmed" ? "green" : status === "cancelled" ? "red" : "orange";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  const candidates = showForm && slotMode === "auto" ? autoSlotCandidates() : [];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button onClick={() => navigate("/reservations")} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1rem", color: "var(--text-muted)", padding: "0.25rem" }}>
            &larr;
          </button>
          <h1>施設予約</h1>
        </div>
        <p>教室・会議室の予約管理</p>
      </div>

      {message && (
        <div className="card" style={{ marginBottom: "1rem", borderColor: messageType === "error" ? "var(--red)" : "var(--green)", fontSize: "0.85rem" }}>
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
              <label>グループ</label>
              <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                <option value="">グループを選択...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.memberCount}人)</option>
                ))}
              </select>
            </div>
          </div>

          {members.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>
                参加者 ({Array.from(participantSelection.values()).filter(Boolean).length}/{members.length})
                {participantGroupIds.length > 0 && (
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> + グループ {participantGroupIds.length}件</span>
                )}
              </label>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {members.map((m) => {
                  const selected = participantSelection.get(m.userId) || false;
                  const conflicts = getMemberConflicts(m.userId);
                  const hasConflict = selected && conflicts.length > 0;
                  return (
                    <button
                      key={m.userId}
                      onClick={() => {
                        setParticipantSelection((prev) => {
                          const next = new Map(prev);
                          next.set(m.userId, !selected);
                          return next;
                        });
                      }}
                      title={hasConflict ? `衝突: ${conflicts.join(", ")}` : m.email}
                      style={{
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        background: selected
                          ? hasConflict ? "rgba(248, 81, 73, 0.2)" : "var(--accent)"
                          : "var(--bg-surface-2)",
                        color: selected && !hasConflict ? "#fff" : selected && hasConflict ? "var(--red)" : "var(--text-muted)",
                        border: hasConflict ? "1px solid var(--red)" : "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                      }}
                    >
                      {m.name}
                      {hasConflict && (
                        <span style={{ marginLeft: "0.3rem", fontSize: "0.65rem", color: "var(--red)", fontWeight: 700 }}>!</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {allGroups.length > 1 && (
                <div style={{ marginTop: "0.5rem" }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                    グループを参加者に追加
                  </label>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {allGroups.filter((g) => g.id !== form.groupId).map((g) => {
                      const selected = participantGroupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={() => {
                            setParticipantGroupIds((prev) =>
                              selected ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                            );
                          }}
                          style={{
                            padding: "0.2rem 0.5rem",
                            fontSize: "0.7rem",
                            background: selected ? "var(--accent)" : "var(--bg-surface-2)",
                            color: selected ? "#fff" : "var(--text-muted)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                          }}
                        >
                          {g.name} ({g.memberCount}人)
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>コマ選択</label>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <button
                onClick={() => setSlotMode("auto")}
                style={{
                  padding: "0.3rem 0.75rem", fontSize: "0.75rem",
                  background: slotMode === "auto" ? "var(--accent)" : "var(--bg-surface-2)",
                  color: slotMode === "auto" ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer",
                }}
              >
                自動提案
              </button>
              <button
                onClick={() => setSlotMode("manual")}
                style={{
                  padding: "0.3rem 0.75rem", fontSize: "0.75rem",
                  background: slotMode === "manual" ? "var(--accent)" : "var(--bg-surface-2)",
                  color: slotMode === "manual" ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer",
                }}
              >
                自由選択
              </button>
            </div>

            {slotMode === "auto" && (
              <div>
                {candidates.length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.5rem" }}>
                    {form.groupId ? "全員が参加可能で空き教室のあるコマが見つかりません" : "グループを選択してください"}
                  </div>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {candidates.slice(0, 20).map((c) => {
                      const isSelected = form.day === c.day && form.period === c.period;
                      return (
                        <button
                          key={`${c.day}-${c.period}`}
                          onClick={() => setForm({ ...form, day: c.day, period: c.period })}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "0.35rem 0.6rem", fontSize: "0.75rem", textAlign: "left",
                            background: isSelected ? "rgba(63, 185, 80, 0.15)" : "var(--bg-surface-2)",
                            border: isSelected ? "1px solid var(--green)" : "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)", cursor: "pointer",
                          }}
                        >
                          <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                            {DAY_LABELS[c.day]} {c.period + 1}限
                          </span>
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                            空き教室: {c.freeRooms.length}室 ({c.freeRooms.slice(0, 3).map((r) => r.name).join(", ")}{c.freeRooms.length > 3 ? "..." : ""})
                          </span>
                        </button>
                      );
                    })}
                    {candidates.length > 20 && (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", padding: "0.25rem" }}>
                        他 {candidates.length - 20} 件...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {slotMode === "manual" && (
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>曜日</label>
                  <select value={form.day} onChange={(e) => setForm({ ...form, day: parseInt(e.target.value, 10) })}>
                    {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>コマ</label>
                  <select value={form.period} onChange={(e) => setForm({ ...form, period: parseInt(e.target.value, 10) })}>
                    {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i + 1}限</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>教室</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", minWidth: 100 }}>
                {form.roomName || form.roomId || "未選択"}
              </span>
              <button
                onClick={() => { fetchRoomsAvailability(); setShowRoomPicker(true); }}
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
              >
                教室を選択
              </button>
            </div>
          </div>

          {showRoomPicker && (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1000,
            }} onClick={() => setShowRoomPicker(false)}>
              <div
                style={{
                  background: "var(--bg-surface)", borderRadius: "var(--radius)", padding: "1.5rem",
                  maxWidth: 500, width: "90%", maxHeight: "70vh", overflowY: "auto",
                  border: "1px solid var(--border)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "0.9rem", margin: 0 }}>空き教室を選択 ({DAY_LABELS[form.day]} {form.period + 1}限)</h3>
                  <button onClick={() => setShowRoomPicker(false)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}>&times;</button>
                </div>

                {(() => {
                  const freeRooms = roomsAvailability.filter((room) =>
                    room.freeSlots.some((s) => s.day === form.day && s.period === form.period)
                  );
                  const busyRooms = roomsAvailability.filter((room) =>
                    !room.freeSlots.some((s) => s.day === form.day && s.period === form.period)
                  );

                  return (
                    <div>
                      {freeRooms.length === 0 ? (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "1rem 0" }}>
                          このコマに空いている教室がありません
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1rem" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>空き教室 ({freeRooms.length})</div>
                          {freeRooms.map((room) => (
                            <button
                              key={room.id}
                              onClick={() => {
                                setForm({ ...form, roomId: room.id, roomName: room.name });
                                setShowRoomPicker(false);
                              }}
                              style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "0.5rem 0.75rem", fontSize: "0.8rem", textAlign: "left",
                                background: form.roomId === room.id ? "rgba(63, 185, 80, 0.15)" : "var(--bg-surface-2)",
                                border: form.roomId === room.id ? "1px solid var(--green)" : "1px solid var(--border)",
                                borderRadius: "var(--radius-sm)", cursor: "pointer",
                              }}
                            >
                              <span style={{ fontWeight: 500 }}>{room.name}</span>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                定員{room.capacity} / {room.type === "classroom" ? "教室" : room.type === "lab" ? "実習室" : room.type}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {busyRooms.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>使用中 ({busyRooms.length})</div>
                          {busyRooms.map((room) => (
                            <div key={room.id} style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", color: "var(--text-muted)", opacity: 0.5 }}>
                              {room.name} — 使用中
                            </div>
                          ))}
                        </div>
                      )}
                      {roomsAvailability.length === 0 && (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "1rem 0" }}>
                          教室データが登録されていません。<a href="/schema-management" style={{ color: "var(--accent)" }}>スキーマ管理</a>で教室を追加してください。
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginTop: "0.75rem" }}>
            <label>メモ</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="メモ（公開）" rows={2} />
          </div>

          <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem" }}>
            <strong>{DAY_LABELS[form.day]} {form.period + 1}限</strong>
            {form.roomName && <span> / {form.roomName}</span>}
            {form.roomId && !form.roomName && <span> / {form.roomId}</span>}
            <span> / 参加者 {Array.from(participantSelection.values()).filter(Boolean).length}人</span>
          </div>

          <button className="primary" onClick={handleCreate} disabled={loading || !form.title || !form.groupId || !form.roomId} style={{ marginTop: "0.75rem" }}>
            {loading ? "作成中..." : "予約を確定"}
          </button>
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="empty-state"><p>予約がありません</p></div>
      ) : (
        <div className="flex-col" style={{ gap: "0.5rem" }}>
          {reservations.map((r) => (
            <div key={r.id} className="card" style={{ padding: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{r.title}</span>
                    {statusBadge(r.status)}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {DAY_LABELS[r.day]} {r.period + 1}限 / {r.roomName || r.roomId}
                    <span style={{ marginLeft: "0.75rem" }}>{new Date(r.createdAt).toLocaleDateString("ja-JP")}</span>
                  </div>
                </div>
                {r.status === "confirmed" && (
                  <button className="danger" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", whiteSpace: "nowrap" }} onClick={() => handleCancel(r.id)}>キャンセル</button>
                )}
              </div>
              {r.participants.length > 0 && (
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                  {r.participants.map((p) => (
                    <span key={p} style={{ fontSize: "0.7rem", background: "var(--bg-surface-2)", padding: "0.1rem 0.3rem", borderRadius: 3 }}>{p}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
