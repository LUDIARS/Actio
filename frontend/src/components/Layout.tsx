import { useState, useCallback, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  group_leader: "グループリーダー",
  general: "一般",
};

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/data-management", label: "M1 データ管理", adminOnly: true },
  { to: "/curriculum-plan", label: "M2 カリキュラムプラン" },
  { to: "/my-plan", label: "マイプラン" },
  { to: "/groups", label: "グループ" },
  { to: "/calendar", label: "カレンダー" },
  { to: "/scheduler", label: "スケジューラ" },
  { to: "/reservations", label: "予約" },
  { to: "/notifications", label: "通知" },
  { to: "/voting", label: "日程調整" },
  { to: "/users", label: "ユーザー一覧" },
  { to: "/admin/users", label: "ユーザー管理", adminOnly: true },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="layout-root">
      {/* Fixed header bar - visible only on mobile */}
      <div className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={toggleSidebar}
          aria-label="メニューを開く"
        >
          <span className={`hamburger-icon ${sidebarOpen ? "open" : ""}`}>
            <span />
            <span />
            <span />
          </span>
        </button>
        <span className="mobile-header-title">Schedula</span>
      </div>

      {/* Overlay backdrop - mobile only */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
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
          {NAV_ITEMS
            .filter((item) => !item.adminOnly || user?.role === "admin")
            .map((item) => (
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
            <div style={{ fontSize: "0.65rem", color: "var(--accent)", marginBottom: "0.15rem" }}>
              {ROLE_LABELS[user.role] || user.role}
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
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
