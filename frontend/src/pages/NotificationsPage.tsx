import { useState, useEffect, useCallback } from "react";
import { m5 } from "../lib/api";
import type {
  Webhook,
  NotificationHistoryItem,
  NotificationPlatform,
  SendMethod,
  NotificationTemplateItem,
} from "../lib/api-types";
import { HelpButton } from "../components/HelpOverlay";
import { useAuth } from "../contexts/AuthContext";

type Notification = NotificationHistoryItem;

/** Event modules — Japanese labels, grouped by module */
const EVENT_MODULES = [
  {
    module: "schedule",
    label: "スケジュール",
    events: [
      { name: "schedule.confirmed", label: "時間割確定" },
      { name: "schedule.changed", label: "授業予定変更" },
    ],
  },
  {
    module: "reservation",
    label: "予約",
    events: [
      { name: "reservation.created", label: "予約作成" },
      { name: "reservation.updated", label: "予約変更" },
      { name: "reservation.cancelled", label: "予約キャンセル" },
      { name: "reservation.reminder", label: "予約リマインド" },
    ],
  },
  {
    module: "calendar",
    label: "カレンダー",
    events: [
      { name: "sync.conflict", label: "予定競合" },
    ],
  },
  {
    module: "reminder",
    label: "リマインダー",
    events: [
      { name: "reminder.morning", label: "朝の未完了タスク通知" },
    ],
  },
];

const ALL_EVENTS = EVENT_MODULES.flatMap((m) => m.events);

/** Flat map: event name → Japanese label */
const EVENT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ALL_EVENTS.map((e: { name: string; label: string }) => [e.name, e.label])
);

/** Get Japanese label for an event name, with fallback */
function getEventLabel(eventName: string): string {
  return EVENT_LABEL_MAP[eventName] || eventName;
}

const PLATFORMS: { value: NotificationPlatform; label: string }[] = [
  { value: "generic", label: "汎用Webhook" },
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "line", label: "LINE" },
];

const SEND_METHODS: { value: SendMethod; label: string }[] = [
  { value: "webhook", label: "Webhook" },
  { value: "bot", label: "Bot" },
];

const PLATFORM_COLORS: Record<NotificationPlatform, string> = {
  generic: "blue",
  slack: "purple",
  discord: "purple",
  line: "green",
};

export function NotificationsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<
    "notifications" | "webhooks" | "templates" | "settings"
  >("notifications");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplateItem[]>([]);
  const [message, setMessage] = useState("");

  // Webhook form
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookPlatform, setWebhookPlatform] =
    useState<NotificationPlatform>("generic");
  const [webhookSendMethod, setWebhookSendMethod] =
    useState<SendMethod>("webhook");
  const [webhookBotToken, setWebhookBotToken] = useState("");
  const [webhookChannelId, setWebhookChannelId] = useState("");
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [newSecret, setNewSecret] = useState("");

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplEvent, setTplEvent] = useState("");
  const [tplPlatform, setTplPlatform] = useState("all");
  const [tplTitle, setTplTitle] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplUseCodeBlock, setTplUseCodeBlock] = useState(false);
  const [tplCodeBlockLang, setTplCodeBlockLang] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );

  // Test send
  const [testEndpointId, setTestEndpointId] = useState("");
  const [testEvent, setTestEvent] = useState("webhook.test");
  const [showTestSend, setShowTestSend] = useState(false);

  // Settings form
  const [, setPrefs] = useState<unknown>(null);

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
      } else if (tab === "templates") {
        const result = await m5.listTemplates();
        setTemplates(result.templates || []);
      } else {
        const result = await m5.getPreferences();
        setPrefs(result);
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error("[NotificationsPage] loadData失敗:", err);
      showMsg(`Error: ${err.message}`);
    }
  }, [tab]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadData();
  }, [loadData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Webhook Handlers ────────────────────────────────────────
  const handleCreateWebhook = async () => {
    try {
      const result = await m5.createWebhook({
        url: webhookUrl,
        events: webhookEvents,
        platform: webhookPlatform,
        sendMethod: webhookSendMethod,
        botToken: webhookSendMethod === "bot" ? webhookBotToken : undefined,
        channelId:
          webhookSendMethod === "bot" ? webhookChannelId : undefined,
      });
      setNewSecret(result.secret);
      setShowWebhookForm(false);
      setWebhookUrl("");
      setWebhookEvents([]);
      setWebhookPlatform("generic");
      setWebhookSendMethod("webhook");
      setWebhookBotToken("");
      setWebhookChannelId("");
      showMsg("エンドポイントを登録しました。Secretを保存してください！");
      loadData();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await m5.deleteWebhook(id);
      showMsg("エンドポイントを削除しました");
      loadData();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  const handleTestWebhook = async (id: string) => {
    try {
      const result = await m5.testWebhook(id);
      showMsg(
        result.delivered
          ? `テスト送信成功 (${result.latencyMs}ms, ${result.platform || "generic"})`
          : `テスト送信失敗: ${result.statusCode}`
      );
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  const handleRotateSecret = async (id: string) => {
    try {
      const result = await m5.rotateSecret(id);
      setNewSecret(result.secret);
      showMsg("Secretをローテーションしました");
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  // ─── Notification Handlers ───────────────────────────────────
  const handleMarkRead = async (id: string) => {
    try {
      await m5.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await m5.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      showMsg("通知を削除しました");
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  const canDelete = (n: Notification) => {
    if (!user) return false;
    return n.userId === user.id || user.role === "admin";
  };

  // ─── Template Handlers ───────────────────────────────────────
  const resetTemplateForm = () => {
    setTplEvent("");
    setTplPlatform("all");
    setTplTitle("");
    setTplBody("");
    setTplUseCodeBlock(false);
    setTplCodeBlockLang("");
    setEditingTemplateId(null);
  };

  const handleCreateTemplate = async () => {
    try {
      if (editingTemplateId) {
        await m5.updateTemplate(editingTemplateId, {
          event: tplEvent,
          platform: tplPlatform,
          title: tplTitle,
          body: tplBody,
          useCodeBlock: tplUseCodeBlock,
          codeBlockLang: tplCodeBlockLang || undefined,
        });
        showMsg("テンプレートを更新しました");
      } else {
        await m5.createTemplate({
          event: tplEvent,
          platform: tplPlatform,
          title: tplTitle,
          body: tplBody,
          useCodeBlock: tplUseCodeBlock,
          codeBlockLang: tplCodeBlockLang || undefined,
        });
        showMsg("テンプレートを作成しました");
      }
      setShowTemplateForm(false);
      resetTemplateForm();
      loadData();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  const handleEditTemplate = (tpl: NotificationTemplateItem) => {
    setEditingTemplateId(tpl.id);
    setTplEvent(tpl.event);
    setTplPlatform(tpl.platform);
    setTplTitle(tpl.title);
    setTplBody(tpl.body);
    setTplUseCodeBlock(tpl.useCodeBlock);
    setTplCodeBlockLang(tpl.codeBlockLang || "");
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await m5.deleteTemplate(id);
      showMsg("テンプレートを削除しました");
      loadData();
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
    }
  };

  // ─── Test Send Handler ───────────────────────────────────────
  const handleTestSend = async () => {
    try {
      const result = await m5.testSend({
        endpointId: testEndpointId,
        event: testEvent,
      });
      showMsg(
        result.delivered
          ? `テスト送信成功 (${result.latencyMs}ms, ${result.platform}/${result.sendMethod})`
          : `テスト送信失敗: ${result.statusCode}`
      );
    } catch (e: unknown) {
      const err = e as Error;
      showMsg(`Error: ${err.message}`);
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
          <h1>通知 & Webhook管理</h1>
          <HelpButton />
        </div>
        <p>通知履歴、エンドポイント管理、テンプレート設定、テスト送信</p>
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
            <strong>Webhook Secret</strong>{" "}
            (保存してください — 再表示されません):
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
              showMsg("コピーしました");
            }}
          >
            Copy
          </button>
          <button
            style={{ marginLeft: "0.25rem", fontSize: "0.7rem" }}
            onClick={() => setNewSecret("")}
          >
            閉じる
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
            { key: "webhooks", label: "エンドポイント" },
            { key: "templates", label: "テンプレート" },
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
          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <button
              onClick={async () => {
                try {
                  const result = await m5.triggerMorningReminder();
                  showMsg(result.message);
                  if (result.sent) loadData();
                } catch (e: unknown) {
                  const err = e as Error;
                  showMsg(`Error: ${err.message}`);
                }
              }}
            >
              朝の未完了タスク通知をテスト
            </button>
          </div>
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
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <span className="badge purple">{getEventLabel(n.event)}</span>
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
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
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
                    {canDelete(n) && (
                      <button
                        className="danger"
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.15rem 0.5rem",
                        }}
                        onClick={() => handleDeleteNotification(n.id)}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Webhooks/Endpoints Tab */}
      {tab === "webhooks" && (
        <div>
          <div className="toolbar" style={{ gap: "0.5rem" }}>
            <button
              className="primary"
              onClick={() => {
                setShowWebhookForm(!showWebhookForm);
                setShowTestSend(false);
              }}
            >
              {showWebhookForm ? "閉じる" : "エンドポイント登録"}
            </button>
            <button
              onClick={() => {
                setShowTestSend(!showTestSend);
                setShowWebhookForm(false);
              }}
            >
              {showTestSend ? "閉じる" : "テスト送信"}
            </button>
          </div>

          {/* Test Send Form */}
          {showTestSend && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3
                style={{
                  fontSize: "0.85rem",
                  marginBottom: "0.5rem",
                }}
              >
                テスト送信
              </h3>
              <div className="form-group">
                <label>送信先エンドポイント</label>
                <select
                  value={testEndpointId}
                  onChange={(e) => setTestEndpointId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {webhooks.map((w) => (
                    <option key={w.id} value={w.id}>
                      [{w.platform}] {w.url}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>イベント種別</label>
                <select
                  value={testEvent}
                  onChange={(e) => setTestEvent(e.target.value)}
                >
                  <option value="webhook.test">webhook.test</option>
                  {EVENT_MODULES.map((mod) => (
                    <optgroup key={mod.module} label={mod.label}>
                      {mod.events.map((ev) => (
                        <option key={ev.name} value={ev.name}>
                          {ev.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                className="primary"
                onClick={handleTestSend}
                disabled={!testEndpointId}
              >
                テスト送信
              </button>
            </div>
          )}

          {/* Webhook Create Form */}
          {showWebhookForm && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div className="form-group">
                  <label>プラットフォーム</label>
                  <select
                    value={webhookPlatform}
                    onChange={(e) =>
                      setWebhookPlatform(
                        e.target.value as NotificationPlatform
                      )
                    }
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>送信方法</label>
                  <select
                    value={webhookSendMethod}
                    onChange={(e) =>
                      setWebhookSendMethod(e.target.value as SendMethod)
                    }
                  >
                    {SEND_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {webhookSendMethod === "webhook" && (
                <div className="form-group">
                  <label>Webhook URL</label>
                  <input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder={
                      webhookPlatform === "slack"
                        ? "https://hooks.slack.com/services/..."
                        : webhookPlatform === "discord"
                          ? "https://discord.com/api/webhooks/..."
                          : webhookPlatform === "line"
                            ? "https://notify-api.line.me/api/notify"
                            : "https://example.com/webhook"
                    }
                  />
                </div>
              )}

              {webhookSendMethod === "bot" && (
                <>
                  <div className="form-group">
                    <label>Bot Token</label>
                    <input
                      type="password"
                      value={webhookBotToken}
                      onChange={(e) => setWebhookBotToken(e.target.value)}
                      placeholder={
                        webhookPlatform === "slack"
                          ? "xoxb-..."
                          : webhookPlatform === "discord"
                            ? "Bot Token"
                            : "Channel Access Token"
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      {webhookPlatform === "line"
                        ? "送信先ID (ユーザー/グループ)"
                        : "チャンネルID"}
                    </label>
                    <input
                      value={webhookChannelId}
                      onChange={(e) => setWebhookChannelId(e.target.value)}
                      placeholder="Channel ID"
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>購読イベント</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {EVENT_MODULES.map((mod) => (
                    <div key={mod.module}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        {mod.label}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingLeft: "0.5rem" }}>
                        {mod.events.map((ev) => (
                          <label
                            key={ev.name}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.8rem",
                              cursor: "pointer",
                              color: webhookEvents.includes(ev.name)
                                ? "var(--text)"
                                : "var(--text-muted)",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={webhookEvents.includes(ev.name)}
                              onChange={() => toggleEvent(ev.name)}
                              style={{ width: "auto" }}
                            />
                            {ev.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="primary"
                onClick={handleCreateWebhook}
                disabled={
                  webhookSendMethod === "webhook"
                    ? !webhookUrl
                    : !webhookBotToken || !webhookChannelId
                }
              >
                登録
              </button>
            </div>
          )}

          {webhooks.length === 0 ? (
            <div className="empty-state">
              <p>登録済みエンドポイントがありません</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>URL / Channel</th>
                  <th>Method</th>
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
                    <td>
                      <span
                        className={`badge ${PLATFORM_COLORS[w.platform] || "blue"}`}
                      >
                        {
                          PLATFORMS.find((p) => p.value === w.platform)
                            ?.label || w.platform
                        }
                      </span>
                    </td>
                    <td
                      style={{
                        fontSize: "0.8rem",
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {w.sendMethod === "bot"
                        ? `Ch: ${w.channelId || "—"}`
                        : w.url}
                    </td>
                    <td>
                      <span
                        className={`badge ${w.sendMethod === "bot" ? "orange" : "blue"}`}
                      >
                        {w.sendMethod}
                      </span>
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
                            {getEventLabel(e)}
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
                    <td
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
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

      {/* Templates Tab */}
      {tab === "templates" && (
        <div>
          <div className="toolbar">
            <button
              className="primary"
              onClick={() => {
                if (showTemplateForm) {
                  resetTemplateForm();
                }
                setShowTemplateForm(!showTemplateForm);
              }}
            >
              {showTemplateForm ? "閉じる" : "テンプレート作成"}
            </button>
          </div>

          {showTemplateForm && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3
                style={{
                  fontSize: "0.85rem",
                  marginBottom: "0.5rem",
                }}
              >
                {editingTemplateId
                  ? "テンプレート編集"
                  : "テンプレート作成"}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div className="form-group">
                  <label>対象イベント</label>
                  <select
                    value={tplEvent}
                    onChange={(e) => setTplEvent(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    <option value="*">* (全イベント)</option>
                    {EVENT_MODULES.map((mod) => (
                      <optgroup key={mod.module} label={mod.label}>
                        {mod.events.map((ev) => (
                          <option key={ev.name} value={ev.name}>
                            {ev.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>対象プラットフォーム</label>
                  <select
                    value={tplPlatform}
                    onChange={(e) => setTplPlatform(e.target.value)}
                  >
                    <option value="all">全プラットフォーム</option>
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>
                  タイトル{" "}
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    ({"{title}"}, {"{day}"}, {"{period}"} 等の変数使用可)
                  </span>
                </label>
                <input
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder="予約「{title}」が作成されました"
                />
              </div>

              <div className="form-group">
                <label>
                  本文{" "}
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    ({"{variable}"} で変数展開)
                  </span>
                </label>
                <textarea
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  rows={4}
                  placeholder="{day} {period}限 - {room}"
                  style={{ width: "100%", fontFamily: "monospace" }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={tplUseCodeBlock}
                    onChange={(e) => setTplUseCodeBlock(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  コードブロックを使用
                </label>
                {tplUseCodeBlock && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input
                      value={tplCodeBlockLang}
                      onChange={(e) => setTplCodeBlockLang(e.target.value)}
                      placeholder="言語 (例: json, text)"
                      style={{ width: 150, fontSize: "0.8rem" }}
                    />
                  </div>
                )}
              </div>

              <button
                className="primary"
                onClick={handleCreateTemplate}
                disabled={!tplEvent || !tplTitle || !tplBody}
              >
                {editingTemplateId ? "更新" : "作成"}
              </button>
              {editingTemplateId && (
                <button
                  style={{ marginLeft: "0.5rem" }}
                  onClick={() => {
                    resetTemplateForm();
                    setShowTemplateForm(false);
                  }}
                >
                  キャンセル
                </button>
              )}
            </div>
          )}

          {templates.length === 0 ? (
            <div className="empty-state">
              <p>
                カスタムテンプレートがありません。デフォルトのテンプレートが使用されます。
              </p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>イベント</th>
                  <th>プラットフォーム</th>
                  <th>タイトル</th>
                  <th>コードブロック</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td>
                      <span className="badge purple">{getEventLabel(tpl.event)}</span>
                    </td>
                    <td>
                      <span className="badge blue">{tpl.platform}</span>
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>{tpl.title}</td>
                    <td>
                      {tpl.useCodeBlock ? (
                        <span className="badge green">
                          {tpl.codeBlockLang || "plain"}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.4rem",
                          }}
                          onClick={() => handleEditTemplate(tpl)}
                        >
                          編集
                        </button>
                        {!tpl.isDefault && (
                          <button
                            className="danger"
                            style={{
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.4rem",
                            }}
                            onClick={() => handleDeleteTemplate(tpl.id)}
                          >
                            削除
                          </button>
                        )}
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
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {EVENT_MODULES.map((mod) => (
                    <div key={mod.module}>
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.15rem" }}>
                        {mod.label}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingLeft: "0.5rem" }}>
                        {mod.events.map((ev) => (
                          <label
                            key={ev.name}
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
                            {ev.label}
                          </label>
                        ))}
                      </div>
                    </div>
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
