import { useState, useEffect, useCallback } from "react";
import { reminderApi } from "../lib/api";
import type { ReminderItem } from "../lib/api-types";

const REPEAT_LABELS: Record<string, string> = {
  none: "なし",
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
  yearly: "毎年",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "未完了",
  done: "完了",
  cancelled: "キャンセル",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#D29922",
  done: "#3FB950",
  cancelled: "#8B949E",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dow = weekdays[d.getDay()];
  return `${month}/${day}(${dow}) ${hours}:${minutes}`;
}

type InputMode = "form" | "text";

export function ReminderPage() {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("form");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Form mode fields
  const [form, setForm] = useState({
    title: "",
    description: "",
    remindAt: "",
    repeatRule: "none",
  });

  // Text mode field
  const [freeText, setFreeText] = useState("");

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  // ─── Fetch ─────────────────────────────────────────────────
  const fetchReminders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await reminderApi.list(statusFilter || undefined);
      setReminders(res.reminders || []);
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // ─── Create (Form Mode) ────────────────────────────────────
  const handleCreateForm = async () => {
    if (!form.title.trim() || !form.remindAt) {
      showMsg("タイトルと日時は必須です");
      return;
    }
    try {
      setLoading(true);
      await reminderApi.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        remindAt: new Date(form.remindAt).toISOString(),
        repeatRule: form.repeatRule,
      });
      setForm({ title: "", description: "", remindAt: "", repeatRule: "none" });
      setShowCreate(false);
      showMsg("リマインダーを作成しました");
      await fetchReminders();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Create (Text Mode) ────────────────────────────────────
  const handleCreateText = async () => {
    if (!freeText.trim()) {
      showMsg("テキストを入力してください");
      return;
    }
    try {
      setLoading(true);
      const res = await reminderApi.parseAndCreate(freeText.trim());
      const conf = Math.round(res.parsed.confidence * 100);
      setFreeText("");
      setShowCreate(false);
      showMsg(`リマインダーを作成しました (解析精度: ${conf}%)`);
      await fetchReminders();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete ────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("このリマインダーを削除しますか？")) return;
    try {
      await reminderApi.remove(id);
      showMsg("削除しました");
      await fetchReminders();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>リマインダー</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "0.4rem 1rem",
            background: "var(--accent)",
            color: "#000",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
        >
          {showCreate ? "閉じる" : "+ 新規作成"}
        </button>
      </div>

      {message && (
        <div style={{
          padding: "0.5rem 1rem",
          marginBottom: "1rem",
          background: message.startsWith("Error") ? "rgba(248,81,73,0.15)" : "rgba(63,185,80,0.15)",
          border: `1px solid ${message.startsWith("Error") ? "var(--red)" : "var(--green)"}`,
          borderRadius: "var(--radius-sm)",
          fontSize: "0.85rem",
          color: message.startsWith("Error") ? "var(--red)" : "var(--green)",
        }}>
          {message}
        </div>
      )}

      {/* ─── Create Form ──────────────────────────────────── */}
      {showCreate && (
        <div style={{
          padding: "1rem",
          marginBottom: "1rem",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              onClick={() => setInputMode("form")}
              style={{
                padding: "0.3rem 0.8rem",
                background: inputMode === "form" ? "var(--accent)" : "var(--bg-surface-2)",
                color: inputMode === "form" ? "#000" : "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              フォーム入力
            </button>
            <button
              onClick={() => setInputMode("text")}
              style={{
                padding: "0.3rem 0.8rem",
                background: inputMode === "text" ? "var(--accent)" : "var(--bg-surface-2)",
                color: inputMode === "text" ? "#000" : "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              自由テキスト入力
            </button>
          </div>

          {inputMode === "form" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="タイトル"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={{
                  padding: "0.4rem 0.6rem",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                }}
              />
              <input
                type="text"
                placeholder="説明 (任意)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={{
                  padding: "0.4rem 0.6rem",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                }}
              />
              <input
                type="datetime-local"
                value={form.remindAt}
                onChange={(e) => setForm({ ...form, remindAt: e.target.value })}
                style={{
                  padding: "0.4rem 0.6rem",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                }}
              />
              <select
                value={form.repeatRule}
                onChange={(e) => setForm({ ...form, repeatRule: e.target.value })}
                style={{
                  padding: "0.4rem 0.6rem",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                }}
              >
                {Object.entries(REPEAT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={handleCreateForm}
                disabled={loading}
                style={{
                  padding: "0.4rem 1rem",
                  background: "var(--accent)",
                  color: "#000",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  alignSelf: "flex-start",
                }}
              >
                作成
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                自然文でリマインダーを入力できます。例: 「明日の10時に会議」「来週月曜日に報告書提出」「3月30日 15:00 歯医者」
              </p>
              <textarea
                placeholder="例: 明日の10時に会議"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={3}
                style={{
                  padding: "0.4rem 0.6rem",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                  resize: "vertical",
                }}
              />
              <button
                onClick={handleCreateText}
                disabled={loading}
                style={{
                  padding: "0.4rem 1rem",
                  background: "var(--accent)",
                  color: "#000",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  alignSelf: "flex-start",
                }}
              >
                解析して作成
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Filter ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {["", "pending", "done", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "0.25rem 0.6rem",
              background: statusFilter === s ? "var(--accent)" : "var(--bg-surface-2)",
              color: statusFilter === s ? "#000" : "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            {s === "" ? "すべて" : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* ─── List ─────────────────────────────────────────── */}
      {loading && reminders.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>読み込み中...</p>
      ) : reminders.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>リマインダーがありません</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {reminders.map((r) => (
            <div
              key={r.id}
              style={{
                padding: "0.75rem 1rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                opacity: r.status === "done" || r.status === "cancelled" ? 0.6 : 1,
              }}
            >
              {(
                /* Display mode (Nuntius 委譲につき編集はキャンセル+再作成で対応) */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <span style={{
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          textDecoration: r.status === "done" ? "line-through" : "none",
                        }}>
                          {r.title}
                        </span>
                        <span style={{
                          fontSize: "0.7rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "var(--radius-sm)",
                          background: `${STATUS_COLORS[r.status] || "#8B949E"}22`,
                          color: STATUS_COLORS[r.status] || "#8B949E",
                          border: `1px solid ${STATUS_COLORS[r.status] || "#8B949E"}44`,
                        }}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                        {r.source !== "web" && (
                          <span style={{
                            fontSize: "0.65rem",
                            padding: "0.1rem 0.3rem",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-surface-2)",
                            color: "var(--text-muted)",
                          }}>
                            {r.source}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.25rem 0" }}>
                          {r.description}
                        </p>
                      )}
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {formatDateTime(r.remindAt)}
                        {r.repeatRule !== "none" && (
                          <span style={{ marginLeft: "0.5rem" }}>
                            ({REPEAT_LABELS[r.repeatRule] || r.repeatRule})
                          </span>
                        )}
                      </div>
                      {r.originalText && (
                        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0", fontStyle: "italic" }}>
                          原文: {r.originalText}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0, marginLeft: "0.5rem" }}>
                      <button
                        onClick={() => handleDelete(r.id)}
                        title="キャンセル (Nuntius 配信停止)"
                        style={{
                          padding: "0.2rem 0.5rem",
                          background: "rgba(248,81,73,0.1)",
                          color: "var(--red)",
                          border: "1px solid rgba(248,81,73,0.3)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
