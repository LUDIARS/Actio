import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { reservationPluginsApi } from "../lib/api";
import type { ReservationPluginInfo } from "../lib/api";

const ICON_MAP: Record<string, string> = {
  Building2: "\u{1F3E2}",
  CalendarCheck: "\u{1F4C5}",
};

export function ReservationsPage() {
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState<ReservationPluginInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reservationPluginsApi.listPlugins()
      .then((res) => setPlugins(res.plugins || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>予約・スケジュール管理</h1>
        <p>利用したい予約モジュールを選択してください</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          読み込み中...
        </div>
      ) : plugins.length === 0 ? (
        <div className="empty-state">
          <p>利用可能な予約プラグインがありません</p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "1rem",
          marginTop: "1rem",
        }}>
          {plugins.map((plugin) => (
            <button
              key={plugin.id}
              onClick={() => navigate(plugin.frontendPath)}
              className="card"
              style={{
                cursor: "pointer",
                textAlign: "left",
                padding: "1.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius)",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>
                {ICON_MAP[plugin.icon] || "\u{1F4CB}"}
              </div>
              <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.25rem" }}>
                {plugin.name}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {plugin.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
