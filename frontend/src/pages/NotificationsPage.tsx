import { useState, useEffect, useCallback } from "react";
import { m5 } from "../lib/api";
import { HelpButton } from "../components/HelpOverlay";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  failCount: number;
  lastDeliveredAt: string | null;
  createdAt: string;
}

interface Notification {
  id: string;
  event: string;
  channel: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

const AVAILABLE_EVENTS = [
  "schedule.confirmed",
  "schedule.changed",
  "reservation.created",
  "reservation.updated",
  "reservation.cancelled",
  "reservation.reminder",
  "sync.conflict",
];

export function NotificationsPage() {
  const [tab, setTab] = useState<"notifications" | "webhooks" | "settings">(
    "notifications"
  );
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState("");

  // Webhook form
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [newSecret, setNewSecret] = useState("");

  // Settings form - loaded preferences are applied to the form defaults
  const [, setPrefs] = useState<any>(null);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      if (tab === "webhooks") {
        const result = await m5.listWebhooks();
        setWebhooks(result.webhooks || []);
      } else if (tab === "notifications") {
        const result = await m5.getHistory();
        setNotifications(result.notifications || []);
      } else {
        const result = await m5.getPreferences();
        setPrefs(result);
      }
    } catch (e: any) {
      console.error("[NotificationsPage] loadData失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  }, [tab]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadData();
  }, [loadData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreateWebhook = async () => {
    try {
      const result = await m5.createWebhook({
        url: webhookUrl,
        events: webhookEvents,
      });
      setNewSecret(result.secret);
      setShowWebhookForm(false);
      setWebhookUrl("");
      setWebhookEvents([]);
      showMsg("Webhook created. Save the secret!");
      loadData();
    } catch (e: any) {
      console.error("[NotificationsPage] handleCreateWebhook失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await m5.deleteWebhook(id);
      showMsg("Webhook deleted");
      loadData();
    } catch (e: any) {
      console.error("[NotificationsPage] handleDeleteWebhook失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleTestWebhook = async (id: string) => {
    try {
      const result = await m5.testWebhook(id);
      showMsg(
        result.delivered
          ? `Test delivered (${result.latencyMs}ms)`
          : `Test failed: ${result.statusCode}`
      );
    } catch (e: any) {
      console.error("[NotificationsPage] handleTestWebhook失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleRotateSecret = async (id: string) => {
    try {
      const result = await m5.rotateSecret(id);
      setNewSecret(result.secret);
      showMsg("Secret rotated");
    } catch (e: any) {
      console.error("[NotificationsPage] handleRotateSecret失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await m5.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (e: any) {
      console.error("[NotificationsPage] handleMarkRead失敗:", e);
      showMsg(`Error: ${e.message}`);
    }
  };

  const toggleEvent = (event: string) => {
    setWebhookEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h1>M5 Webhook & 通知</h1>
          <HelpButton />
        </div>
        <p>通知履歴、Webhook管理、通知設定</p>
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

      {newSecret && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: "var(--orange)",
          }}
        >
          <div style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
            <strong>Webhook Secret</strong> (save this — it won't be shown again):
          </div>
          <code
            style={{
              fontSize: "0.75rem",
              background: "var(--bg)",
              padding: "0.25rem 0.5rem",
              borderRadius: 4,
              wordBreak: "break-all",
            }}
          >
            {newSecret}
          </code>
          <button
            style={{ marginLeft: "0.5rem", fontSize: "0.7rem" }}
            onClick={() => {
              navigator.clipboard.writeText(newSecret);
              showMsg("Copied");
            }}
          >
            Copy
          </button>
          <button
            style={{ marginLeft: "0.25rem", fontSize: "0.7rem" }}
            onClick={() => setNewSecret("")}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: "1rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(
          [
            { key: "notifications", label: "通知履歴" },
            { key: "webhooks", label: "Webhook管理" },
            { key: "settings", label: "通知設定" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              border: "none",
              borderBottom:
                tab === t.key
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              background: "transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              padding: "0.5rem 1rem",
              fontWeight: tab === t.key ? 600 : 400,
              borderRadius: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Notifications Tab */}
      {tab === "notifications" && (
        <div>
          {notifications.length === 0 ? (
            <div className="empty-state">
              <p>通知履歴がありません</p>
            </div>
          ) : (
            <div className="flex-col">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="card"
                  style={{
                    padding: "0.75rem",
                    opacity: n.isRead ? 0.6 : 1,
                    borderLeft: n.isRead
                      ? undefined
                      : "3px solid var(--accent)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      {n.title}
                    </span>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span className="badge purple">{n.event}</span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {new Date(n.createdAt).toLocaleString("ja-JP")}
                      </span>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {n.body}
                  </p>
                  {!n.isRead && (
                    <button
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.15rem 0.5rem",
                      }}
                      onClick={() => handleMarkRead(n.id)}
                    >
                      既読にする
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {tab === "webhooks" && (
        <div>
          <div className="toolbar">
            <button
              className="primary"
              onClick={() => setShowWebhookForm(!showWebhookForm)}
            >
              {showWebhookForm ? "閉じる" : "Webhook登録"}
            </button>
          </div>

          {showWebhookForm && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <div className="form-group">
                <label>URL</label>
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                />
              </div>
              <div className="form-group">
                <label>購読イベント</label>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  {AVAILABLE_EVENTS.map((event) => (
                    <label
                      key={event}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        color: webhookEvents.includes(event)
                          ? "var(--text)"
                          : "var(--text-muted)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(event)}
                        onChange={() => toggleEvent(event)}
                        style={{ width: "auto" }}
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </div>
              <button
                className="primary"
                onClick={handleCreateWebhook}
                disabled={!webhookUrl}
              >
                登録
              </button>
            </div>
          )}

          {webhooks.length === 0 ? (
            <div className="empty-state">
              <p>登録済みWebhookがありません</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Failures</th>
                  <th>Last Delivery</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td
                      style={{
                        fontSize: "0.8rem",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {w.url}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.2rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {(w.events as string[]).map((e) => (
                          <span
                            key={e}
                            style={{
                              fontSize: "0.6rem",
                              background: "var(--bg-surface-2)",
                              padding: "0.05rem 0.3rem",
                              borderRadius: 3,
                            }}
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${w.isActive ? "green" : "red"}`}
                      >
                        {w.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>{w.failCount}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {w.lastDeliveredAt
                        ? new Date(w.lastDeliveredAt).toLocaleString("ja-JP")
                        : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.4rem",
                          }}
                          onClick={() => handleTestWebhook(w.id)}
                        >
                          Test
                        </button>
                        <button
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.4rem",
                          }}
                          onClick={() => handleRotateSecret(w.id)}
                        >
                          Rotate
                        </button>
                        <button
                          className="danger"
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.4rem",
                          }}
                          onClick={() => handleDeleteWebhook(w.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === "settings" && (
        <div className="card">
          <h3
            style={{
              fontSize: "0.85rem",
              marginBottom: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            通知チャンネル設定
          </h3>

          {(["in_app", "email", "push"] as const).map((channel) => (
            <div
              key={channel}
              style={{
                padding: "0.75rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {channel === "in_app"
                    ? "アプリ内通知"
                    : channel === "email"
                      ? "メール通知"
                      : "プッシュ通知"}
                </span>
                <span className="badge blue">{channel}</span>
              </div>

              <div className="form-group">
                <label>購読イベント</label>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  {AVAILABLE_EVENTS.map((event) => (
                    <label
                      key={event}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        defaultChecked
                        style={{ width: "auto" }}
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0.5rem",
                  fontSize: "0.8rem",
                }}
              >
                <div className="form-group">
                  <label>前日リマインド時刻</label>
                  <input type="time" defaultValue="18:00" />
                </div>
                <div className="form-group">
                  <label>当日朝リマインド時刻</label>
                  <input type="time" defaultValue="08:00" />
                </div>
                <div className="form-group">
                  <label>直前リマインド（分前）</label>
                  <input type="number" defaultValue={15} min={5} max={60} />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div className="form-group">
                  <label>Quiet Hours開始</label>
                  <input type="time" defaultValue="22:00" />
                </div>
                <div className="form-group">
                  <label>Quiet Hours終了</label>
                  <input type="time" defaultValue="07:00" />
                </div>
              </div>
            </div>
          ))}

          <button
            className="primary"
            style={{ marginTop: "1rem" }}
            onClick={() => showMsg("Settings saved (demo)")}
          >
            保存
          </button>
        </div>
      )}
    </div>
  );
}
