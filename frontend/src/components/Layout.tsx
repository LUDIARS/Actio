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
  removable?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/schema-management", label: "M1 スキーマ管理", adminOnly: true, removable: true },
  { to: "/data-management", label: "M1 データ管理", adminOnly: true, removable: true },
  { to: "/my-plan", label: "マイプラン", removable: true },
  { to: "/groups", label: "グループ", removable: true },
  { to: "/calendar", label: "カレンダー", removable: true },
  { to: "/reminders", label: "リマインダー", removable: true },
  { to: "/reservations", label: "予約管理", removable: true },
  { to: "/notifications", label: "M5 通知", removable: true },
  { to: "/voting", label: "M6 日程調整", removable: true },
  { to: "/integrations", label: "外部連携", removable: true },
  { to: "/api-keys", label: "API連携", removable: true },
  { to: "/admin/users", label: "ユーザー管理" },
  { to: "/admin/settings", label: "設定", adminOnly: true },
  { to: "/admin/activity-logs", label: "操作ログ", adminOnly: true },
  { to: "/admin/db", label: "DB Viewer", adminOnly: true },
  { to: "/admin/secrets", label: "シークレット", adminOnly: true },
  { to: "/help", label: "ヘルプ" },
];

const HIDDEN_MODULES_KEY = "schedula_hidden_modules";

function getHiddenModules(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_MODULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setHiddenModules(hidden: string[]) {
  localStorage.setItem(HIDDEN_MODULES_KEY, JSON.stringify(hidden));
}

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [hiddenModules, setHiddenModulesState] = useState<string[]>(getHiddenModules);
  const location = useLocation();

  // Close sidebar on route change
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleModule = (to: string) => {
    setHiddenModulesState((prev) => {
      const next = prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to];
      setHiddenModules(next);
      return next;
    });
  };

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && user?.role !== "admin") return false;
    if (!editMode && hiddenModules.includes(item.to)) return false;
    return true;
  });

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Schedula</h2>
            <button
              onClick={() => setEditMode((prev) => !prev)}
              style={{
                background: editMode ? "var(--accent)" : "var(--bg-surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.15rem 0.4rem",
                fontSize: "0.65rem",
                color: editMode ? "#000" : "var(--text-muted)",
                cursor: "pointer",
              }}
              title="モジュールの表示/非表示を切り替え"
            >
              {editMode ? "完了" : "編集"}
            </button>
          </div>
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
          {visibleItems.map((item) => (
            <div key={item.to} style={{ display: "flex", alignItems: "center" }}>
              {editMode && item.removable && (
                <button
                  onClick={() => toggleModule(item.to)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.3rem 0.25rem 0.3rem 0.5rem",
                    fontSize: "0.75rem",
                    color: hiddenModules.includes(item.to) ? "var(--green)" : "var(--red)",
                    flexShrink: 0,
                  }}
                  title={hiddenModules.includes(item.to) ? "表示する" : "非表示にする"}
                >
                  {hiddenModules.includes(item.to) ? "+" : "−"}
                </button>
              )}
              <NavLink
                to={item.to}
                end={item.to === "/"}
                style={({ isActive }) => ({
                  padding: "0.5rem 1rem",
                  fontSize: "0.85rem",
                  color: hiddenModules.includes(item.to)
                    ? "var(--text-muted)"
                    : isActive ? "var(--text)" : "var(--text-muted)",
                  background: isActive && !hiddenModules.includes(item.to) ? "var(--bg-surface-2)" : "transparent",
                  borderLeft: isActive && !hiddenModules.includes(item.to)
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  textDecoration: hiddenModules.includes(item.to) ? "line-through" : "none",
                  opacity: hiddenModules.includes(item.to) ? 0.5 : 1,
                  transition: "all 0.15s",
                  flex: 1,
                })}
                onClick={(e) => {
                  if (editMode && hiddenModules.includes(item.to)) {
                    e.preventDefault();
                  }
                }}
              >
                {item.label}
              </NavLink>
            </div>
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
