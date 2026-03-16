import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/schedule", label: "M1 時間割" },
  { to: "/scheduler", label: "M3 スケジューラ" },
  { to: "/reservations", label: "M4 予約" },
  { to: "/notifications", label: "M5 通知" },
];

export function Layout() {
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
            Academic Scheduling
          </span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
      </aside>
      <main style={{ flex: 1, padding: "1.5rem 2rem", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
