import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { m6Voting } from "../lib/api";
import type { VotingEvent, Vote } from "../lib/api-types";
import { useWsEvents } from "../hooks/useWsEvent";
import { HelpButton } from "../components/HelpOverlay";

// ─── Types ──────────────────────────────────────────────────

interface VoteSummary {
  ok: number;
  maybe: number;
  ng: number;
}

type VoteRecord = Vote;

type VoteAnswer = "ok" | "maybe" | "ng";

const ANSWER_LABELS: Record<VoteAnswer, string> = {
  ok: "\u25CB",
  maybe: "\u25B3",
  ng: "\u00D7",
};

const ANSWER_COLORS: Record<VoteAnswer, string> = {
  ok: "#3FB950",
  maybe: "#D29922",
  ng: "#F85149",
};

// ─── Component ──────────────────────────────────────────────

export function VotingPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<VotingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    event: VotingEvent;
    summary: Record<string, VoteSummary>;
    responses: Record<string, Record<string, VoteRecord>>;
    respondents: Record<string, string>;
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Create form
  const [form, setForm] = useState({
    title: "",
    description: "",
    deadline: "",
    candidatesText: "",
  });

  // Vote form: candidateId -> answer
  const [voteForm, setVoteForm] = useState<Record<string, VoteAnswer>>({});

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  // ─── Fetch events ──────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    try {
      const res = await m6Voting.listEvents();
      setEvents(res.events || []);
    } catch (e: any) {
      console.error("[VotingPage] fetchEvents失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Fetch event detail ────────────────────────────────────

  const fetchDetail = async (eventId: string) => {
    try {
      const res = await m6Voting.getEvent(eventId);
      setDetail(res);
      setSelectedEventId(eventId);

      // Pre-fill vote form with existing votes
      const myVotes = res.responses?.[user?.id || ""] || {};
      const initial: Record<string, VoteAnswer> = {};
      for (const cand of res.event.candidates) {
        const existing = myVotes[cand.id];
        initial[cand.id] = existing?.answer || "ok";
      }
      setVoteForm(initial);
    } catch (e: any) {
      console.error("[VotingPage] fetchDetail失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  // WS リアルタイム通知: 投票変更時に自動リフレッシュ
  useWsEvents(
    ["voting.vote_submitted", "voting.event_updated"],
    useCallback(() => {
      fetchEvents();
      if (selectedEventId) {
        fetchDetail(selectedEventId);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchEvents, selectedEventId]),
  );

  // ─── Create event ──────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.title || !form.candidatesText.trim()) {
      showMsg("Error: タイトルと候補日を入力してください");
      return;
    }

    setLoading(true);
    try {
      const candidates = form.candidatesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      await m6Voting.createEvent({
        title: form.title,
        description: form.description,
        deadline: form.deadline || undefined,
        candidates,
      });
      showMsg("イベントを作成しました");
      setShowCreate(false);
      setForm({ title: "", description: "", deadline: "", candidatesText: "" });
      fetchEvents();
    } catch (e: any) {
      console.error("[VotingPage] handleCreate失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  // ─── Submit votes ──────────────────────────────────────────

  const handleSubmitVotes = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const votes = Object.entries(voteForm).map(([candidateId, answer]) => ({
        candidateId,
        answer,
      }));
      await m6Voting.submitVotes(selectedEventId, votes);
      showMsg("回答を送信しました");
      fetchDetail(selectedEventId);
    } catch (e: any) {
      console.error("[VotingPage] handleSubmitVotes失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  // ─── Auto-reply ────────────────────────────────────────────

  const handleAutoReply = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const res = await m6Voting.autoReply(selectedEventId);
      showMsg(res.message);
      fetchDetail(selectedEventId);
    } catch (e: any) {
      console.error("[VotingPage] handleAutoReply失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  // ─── Close event ───────────────────────────────────────────

  const handleClose = async (eventId: string) => {
    try {
      await m6Voting.updateEvent(eventId, { status: "closed" });
      showMsg("イベントを締め切りました");
      fetchEvents();
      if (selectedEventId === eventId) {
        fetchDetail(eventId);
      }
    } catch (e: any) {
      console.error("[VotingPage] handleClose失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  // ─── Delete event ──────────────────────────────────────────

  const handleDelete = async (eventId: string) => {
    try {
      await m6Voting.deleteEvent(eventId);
      showMsg("イベントを削除しました");
      if (selectedEventId === eventId) {
        setSelectedEventId(null);
        setDetail(null);
      }
      fetchEvents();
    } catch (e: any) {
      console.error("[VotingPage] handleDelete失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>M6 日程調整</h1>
          <HelpButton />
        </div>
        <p>候補日を設定し、参加者の希望を集計します</p>
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

      <div className="toolbar">
        <button className="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "閉じる" : "新規イベント作成"}
        </button>
        <button onClick={fetchEvents}>更新</button>
      </div>

      {/* ─── Create Form ──────────────────────────────────── */}
      {showCreate && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
            イベント作成
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="form-group">
              <label>タイトル</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例: 第3回定例MTG"
              />
            </div>
            <div className="form-group">
              <label>回答期限</label>
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>説明</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="イベントの説明（任意）"
                rows={2}
              />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>候補日時（1行に1候補）</label>
              <textarea
                value={form.candidatesText}
                onChange={(e) => setForm({ ...form, candidatesText: e.target.value })}
                placeholder={"月 1限\n火 3限\n3/20(木) 10:30〜11:30"}
                rows={5}
                style={{ fontFamily: "monospace" }}
              />
            </div>
          </div>
          <button
            className="primary"
            onClick={handleCreate}
            disabled={loading || !form.title}
            style={{ marginTop: "0.5rem" }}
          >
            {loading ? "作成中..." : "イベントを作成"}
          </button>
        </div>
      )}

      {/* ─── Event List ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 320px" }}>
          <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            イベント一覧
          </h3>
          {events.length === 0 ? (
            <div className="empty-state">
              <p>イベントがありません</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {events.map((e) => (
                <div
                  key={e.id}
                  className="card"
                  style={{
                    cursor: "pointer",
                    borderColor: selectedEventId === e.id ? "var(--accent)" : undefined,
                    transition: "border-color 0.15s",
                  }}
                  onClick={() => fetchDetail(e.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{e.title}</span>
                    <span
                      className={`badge ${e.status === "open" ? "green" : "red"}`}
                      style={{ fontSize: "0.7rem" }}
                    >
                      {e.status === "open" ? "受付中" : "締切"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    候補: {e.candidates.length}件
                    {e.deadline && ` | 期限: ${new Date(e.deadline).toLocaleString("ja-JP")}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Event Detail / Voting ──────────────────────── */}
        {detail && (
          <div style={{ flex: 1 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>{detail.event.title}</h2>
                  {detail.event.description && (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                      {detail.event.description}
                    </p>
                  )}
                </div>
                {detail.event.createdBy === user?.id && (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {detail.event.status === "open" && (
                      <button
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                        onClick={() => handleClose(detail.event.id)}
                      >
                        締め切る
                      </button>
                    )}
                    <button
                      className="danger"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => handleDelete(detail.event.id)}
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>

              {/* ─── Summary Table ────────────────────────── */}
              <table className="table" style={{ marginTop: "1rem" }}>
                <thead>
                  <tr>
                    <th>候補</th>
                    <th style={{ textAlign: "center" }}>{ANSWER_LABELS.ok}</th>
                    <th style={{ textAlign: "center" }}>{ANSWER_LABELS.maybe}</th>
                    <th style={{ textAlign: "center" }}>{ANSWER_LABELS.ng}</th>
                    {/* Per-respondent columns */}
                    {Object.entries(detail.respondents).map(([uid, name]) => (
                      <th key={uid} style={{ fontSize: "0.75rem", textAlign: "center" }}>
                        {name}
                      </th>
                    ))}
                    {/* My vote column (if open) */}
                    {detail.event.status === "open" && (
                      <th style={{ fontSize: "0.75rem", textAlign: "center" }}>自分の回答</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {detail.event.candidates.map((cand) => {
                    const s = detail.summary[cand.id] || { ok: 0, maybe: 0, ng: 0 };
                    return (
                      <tr key={cand.id}>
                        <td style={{ fontWeight: 600 }}>{cand.label}</td>
                        <td style={{ textAlign: "center", color: ANSWER_COLORS.ok }}>{s.ok}</td>
                        <td style={{ textAlign: "center", color: ANSWER_COLORS.maybe }}>{s.maybe}</td>
                        <td style={{ textAlign: "center", color: ANSWER_COLORS.ng }}>{s.ng}</td>
                        {Object.keys(detail.respondents).map((uid) => {
                          const v = detail.responses[uid]?.[cand.id];
                          const ans = v?.answer as VoteAnswer | undefined;
                          return (
                            <td key={uid} style={{ textAlign: "center" }}>
                              {ans ? (
                                <span
                                  style={{
                                    color: ANSWER_COLORS[ans],
                                    fontWeight: 700,
                                    fontSize: "1rem",
                                  }}
                                  title={v?.isAutoReply ? "自動回答" : "手動回答"}
                                >
                                  {ANSWER_LABELS[ans]}
                                  {v?.isAutoReply && (
                                    <span style={{ fontSize: "0.6rem", verticalAlign: "super" }}>A</span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ color: "var(--text-muted)" }}>-</span>
                              )}
                            </td>
                          );
                        })}
                        {detail.event.status === "open" && (
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                              {(["ok", "maybe", "ng"] as VoteAnswer[]).map((ans) => (
                                <button
                                  key={ans}
                                  onClick={() =>
                                    setVoteForm((prev) => ({ ...prev, [cand.id]: ans }))
                                  }
                                  style={{
                                    width: 32,
                                    height: 28,
                                    fontSize: "0.9rem",
                                    fontWeight: 700,
                                    border:
                                      voteForm[cand.id] === ans
                                        ? `2px solid ${ANSWER_COLORS[ans]}`
                                        : "1px solid var(--border)",
                                    background:
                                      voteForm[cand.id] === ans
                                        ? `${ANSWER_COLORS[ans]}22`
                                        : "var(--bg-surface)",
                                    color: ANSWER_COLORS[ans],
                                    borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  {ANSWER_LABELS[ans]}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ─── Action Buttons ──────────────────────── */}
              {detail.event.status === "open" && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                  <button
                    className="primary"
                    onClick={handleSubmitVotes}
                    disabled={loading}
                  >
                    {loading ? "送信中..." : "回答を送信"}
                  </button>
                  <button onClick={handleAutoReply} disabled={loading}>
                    {loading ? "処理中..." : "予定から自動回答"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
