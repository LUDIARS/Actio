import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/data-management", label: "M1 データ管理" },
  { to: "/curriculum-plan", label: "M2 カリキュラムプラン" },
  { to: "/my-plan", label: "マイプラン" },
  { to: "/groups", label: "グループ" },
  { to: "/calendar", label: "カレンダー" },
  { to: "/scheduler", label: "スケジューラ" },
  { to: "/reservations", label: "予約" },
  { to: "/notifications", label: "通知" },
  { to: "/voting", label: "日程調整" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          padding: "1rem 0",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0 1rem 1rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "0.5rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Schedula</h2>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
            }}
          >
            Scheduling Platform
          </span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                padding: "0.5rem 1rem",
                fontSize: "0.85rem",
                color: isActive ? "var(--text)" : "var(--text-muted)",
                background: isActive ? "var(--bg-surface-2)" : "transparent",
                borderLeft: isActive
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info & logout */}
        {user && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "0.75rem 1rem",
              marginTop: "auto",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.15rem" }}>
              {user.name}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              {user.email}
            </div>
            <button
              onClick={() => logout()}
              style={{
                width: "100%",
                padding: "0.35rem",
                fontSize: "0.75rem",
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              ログアウト
            </button>
          </div>
        )}
      </aside>
      <main style={{ flex: 1, padding: "1.5rem 2rem", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
