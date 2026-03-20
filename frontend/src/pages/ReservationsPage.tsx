import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DAY_LABELS } from "../lib/constants";
import { m4 } from "../lib/api";
import { HelpButton } from "../components/HelpOverlay";

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

export function ReservationsPage() {
  const [searchParams] = useSearchParams();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showForm, setShowForm] = useState(
    searchParams.has("day") || false
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Form state
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
      console.error("[ReservationsPage] fetchReservations失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async () => {
    setLoading(true);
    try {
      const participants = form.participants
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

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
      console.error("[ReservationsPage] handleCreate失敗:", e);
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
      console.error("[ReservationsPage] handleCancel失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  const statusBadge = (status: string) => {
    const cls =
      status === "confirmed"
        ? "green"
        : status === "cancelled"
          ? "red"
          : "orange";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>M4 予約システム</h1>
          <HelpButton />
        </div>
        <p>空きコマに予約を登録し、全ユーザーに公開共有</p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: message.startsWith("Error")
              ? "var(--red)"
              : "var(--green)",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      <div className="toolbar">
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "閉じる" : "新規予約"}
        </button>
        <button onClick={fetchReservations}>更新</button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3
            style={{
              fontSize: "0.85rem",
              marginBottom: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            予約作成
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
            }}
          >
            <div className="form-group">
              <label>タイトル</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="MTGタイトル"
              />
            </div>
            <div className="form-group">
              <label>グループID</label>
              <input
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                placeholder="group-id"
              />
            </div>
            <div className="form-group">
              <label>曜日</label>
              <select
                value={form.day}
                onChange={(e) =>
                  setForm({ ...form, day: parseInt(e.target.value, 10) })
                }
              >
                {DAY_LABELS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>コマ</label>
              <select
                value={form.period}
                onChange={(e) =>
                  setForm({ ...form, period: parseInt(e.target.value, 10) })
                }
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}限
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>教室ID</label>
              <input
                value={form.roomId}
                onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                placeholder="room-id"
              />
            </div>
            <div className="form-group">
              <label>参加者（カンマ区切り）</label>
              <input
                value={form.participants}
                onChange={(e) =>
                  setForm({ ...form, participants: e.target.value })
                }
                placeholder="user-1, user-2"
              />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>メモ</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="メモ（公開）"
                rows={2}
              />
            </div>
          </div>
          <button
            className="primary"
            onClick={handleCreate}
            disabled={loading || !form.title}
            style={{ marginTop: "0.5rem" }}
          >
            {loading ? "作成中..." : "予約を確定"}
          </button>
        </div>
      )}

      {/* Reservation list */}
      {reservations.length === 0 ? (
        <div className="empty-state">
          <p>予約がありません</p>
        </div>
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
                <td>
                  {DAY_LABELS[r.day]} {r.period + 1}限
                </td>
                <td>{r.roomName || r.roomId}</td>
                <td>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.25rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {r.participants.map((p) => (
                      <span
                        key={p}
                        style={{
                          fontSize: "0.7rem",
                          background: "var(--bg-surface-2)",
                          padding: "0.1rem 0.3rem",
                          borderRadius: 3,
                        }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{statusBadge(r.status)}</td>
                <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                </td>
                <td>
                  {r.status === "confirmed" && (
                    <button
                      className="danger"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => handleCancel(r.id)}
                    >
                      キャンセル
                    </button>
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
