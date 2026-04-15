import { useState, useCallback, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { moduleRegistry, MENU_CATEGORY_LABELS, MENU_CATEGORY_ORDER } from "../lib/module-registry";
import type { MenuCategory, MenuGroup, MenuItem } from "../lib/module-registry";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  group_leader: "グループリーダー",
  general: "一般",
};

const HIDDEN_MODULES_KEY = "actio_hidden_modules";
const COLLAPSED_GROUPS_KEY = "actio_collapsed_groups";
const COLLAPSED_CATEGORIES_KEY = "actio_collapsed_categories";

/** 予定 / タスク / その他 の順で描画 */
const CATEGORY_ORDER: MenuCategory[] = (["event", "task", "other"] as MenuCategory[]).sort(
  (a, b) => MENU_CATEGORY_ORDER[a] - MENU_CATEGORY_ORDER[b],
);

/** モジュール追加権限 (admin / group_leader) */
function canManageModules(role: string | undefined): boolean {
  return role === "admin" || role === "group_leader";
}

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

function getCollapsedGroups(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCollapsedGroupsStorage(collapsed: string[]) {
  localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(collapsed));
}

function getCollapsedCategories(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCollapsedCategoriesStorage(collapsed: string[]) {
  localStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify(collapsed));
}

/** ロールがメニュー項目/グループの要件を満たすか */
function meetsRole(userRole: string | undefined, adminOnly?: boolean): boolean {
  if (!adminOnly) return true;
  return userRole === "admin";
}

/** メニュー項目を描画 */
function NavItemRow({
  item,
  editMode,
  hiddenModules,
  onToggle,
}: {
  item: MenuItem;
  editMode: boolean;
  hiddenModules: string[];
  onToggle: (to: string) => void;
}) {
  const isHidden = hiddenModules.includes(item.to);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {editMode && item.removable && (
        <button
          onClick={() => onToggle(item.to)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "0.3rem 0.25rem 0.3rem 0.5rem",
            fontSize: "0.75rem",
            color: isHidden ? "var(--green)" : "var(--red)",
            flexShrink: 0,
          }}
          title={isHidden ? "表示する" : "非表示にする"}
        >
          {isHidden ? "+" : "−"}
        </button>
      )}
      <NavLink
        to={item.to}
        end={item.to === "/"}
        style={({ isActive }) => ({
          padding: "0.4rem 1rem",
          paddingLeft: "1.5rem",
          fontSize: "0.8rem",
          color: isHidden
            ? "var(--text-muted)"
            : isActive
              ? "var(--text)"
              : "var(--text-muted)",
          background:
            isActive && !isHidden
              ? "var(--bg-surface-2)"
              : "transparent",
          borderLeft:
            isActive && !isHidden
              ? "2px solid var(--accent)"
              : "2px solid transparent",
          textDecoration: isHidden ? "line-through" : "none",
          opacity: isHidden ? 0.5 : 1,
          transition: "all 0.15s",
          flex: 1,
          display: "block",
        })}
        onClick={(e) => {
          if (editMode && isHidden) {
            e.preventDefault();
          }
        }}
      >
        {item.label}
      </NavLink>
    </div>
  );
}

/** メニューグループ (折りたたみ可能) — カテゴリ内のサブメニュー */
function NavGroupSection({
  group,
  editMode,
  hiddenModules,
  collapsed,
  onToggle,
  onCollapseToggle,
}: {
  group: MenuGroup;
  editMode: boolean;
  hiddenModules: string[];
  collapsed: boolean;
  onToggle: (to: string) => void;
  onCollapseToggle: (groupId: string) => void;
}) {
  // 表示可能なアイテムがあるか確認
  const visibleItems = editMode
    ? group.items
    : group.items.filter((item) => !hiddenModules.includes(item.to));

  if (!editMode && visibleItems.length === 0) return null;

  return (
    <div style={{ marginTop: "0.1rem" }}>
      <button
        onClick={() => onCollapseToggle(group.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          width: "100%",
          padding: "0.3rem 0.75rem 0.3rem 1.25rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "0.7rem",
          fontWeight: 600,
          color: "var(--text-muted)",
          textAlign: "left",
        }}
        title={collapsed ? "展開" : "折りたたむ"}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.15s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            fontSize: "0.55rem",
          }}
        >
          ▼
        </span>
        {group.label}
      </button>
      {!collapsed && (
        <div style={{ paddingLeft: "0.5rem" }}>
          {(editMode ? group.items : visibleItems).map((item) => (
            <NavItemRow
              key={item.to}
              item={item}
              editMode={editMode}
              hiddenModules={hiddenModules}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** トップレベルのカテゴリ (予定 / タスク / その他機能) */
function NavCategorySection({
  category,
  groups,
  editMode,
  hiddenModules,
  collapsed,
  collapsedGroups,
  canManage,
  onToggle,
  onCategoryCollapseToggle,
  onGroupCollapseToggle,
  onAddModule,
}: {
  category: MenuCategory;
  groups: MenuGroup[];
  editMode: boolean;
  hiddenModules: string[];
  collapsed: boolean;
  collapsedGroups: string[];
  canManage: boolean;
  onToggle: (to: string) => void;
  onCategoryCollapseToggle: (category: MenuCategory) => void;
  onGroupCollapseToggle: (groupId: string) => void;
  onAddModule: (category: MenuCategory) => void;
}) {
  // 表示可能なグループがあるか確認 (編集モードでは全表示)
  const hasVisible =
    editMode ||
    groups.some((g) =>
      g.items.some((i) => !hiddenModules.includes(i.to)),
    );

  if (!hasVisible && !canManage) return null;

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <button
        onClick={() => onCategoryCollapseToggle(category)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          width: "100%",
          padding: "0.4rem 0.75rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "0.75rem",
          fontWeight: 700,
          color: "var(--text)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          textAlign: "left",
        }}
        title={collapsed ? "展開" : "折りたたむ"}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.15s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            fontSize: "0.6rem",
            color: "var(--accent)",
          }}
        >
          ▼
        </span>
        {MENU_CATEGORY_LABELS[category]}
      </button>
      {!collapsed && (
        <div>
          {groups.map((group) => (
            <NavGroupSection
              key={group.id}
              group={group}
              editMode={editMode}
              hiddenModules={hiddenModules}
              collapsed={collapsedGroups.includes(group.id)}
              onToggle={onToggle}
              onCollapseToggle={onGroupCollapseToggle}
            />
          ))}
          {canManage && (
            <button
              onClick={() => onAddModule(category)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                width: "calc(100% - 1rem)",
                margin: "0.2rem 0.5rem 0.3rem 1.25rem",
                padding: "0.25rem 0.5rem",
                background: "transparent",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                textAlign: "left",
              }}
              title={`${MENU_CATEGORY_LABELS[category]} にモジュールを追加`}
            >
              <span style={{ fontSize: "0.8rem", lineHeight: 1 }}>+</span>
              モジュール追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [hiddenModules, setHiddenModulesState] = useState<string[]>(getHiddenModules);
  const [collapsedGroups, setCollapsedGroupsState] = useState<string[]>(getCollapsedGroups);
  const [collapsedCategories, setCollapsedCategoriesState] = useState<string[]>(getCollapsedCategories);
  const location = useLocation();
  const navigate = useNavigate();

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

  const toggleModule = useCallback((to: string) => {
    setHiddenModulesState((prev) => {
      const next = prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to];
      setHiddenModules(next);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsedGroupsState((prev) => {
      const next = prev.includes(groupId)
        ? prev.filter((g) => g !== groupId)
        : [...prev, groupId];
      setCollapsedGroupsStorage(next);
      return next;
    });
  }, []);

  const toggleCategoryCollapse = useCallback((category: MenuCategory) => {
    setCollapsedCategoriesState((prev) => {
      const next = prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category];
      setCollapsedCategoriesStorage(next);
      return next;
    });
  }, []);

  const handleAddModule = useCallback(
    (category: MenuCategory) => {
      navigate(`/admin/modules?category=${category}`);
    },
    [navigate],
  );

  // レジストリからメニュー構造を取得
  const topLevelItems = moduleRegistry.getTopLevelMenuItems();
  const groupsByCategory = moduleRegistry.getMenuGroupsByCategory();

  // 各カテゴリ内のグループをロール & admin フィルタ
  const filteredGroupsByCategory = {} as Record<MenuCategory, MenuGroup[]>;
  for (const cat of CATEGORY_ORDER) {
    filteredGroupsByCategory[cat] = groupsByCategory[cat]
      .filter((g) => meetsRole(user?.role, g.adminOnly))
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => meetsRole(user?.role, item.adminOnly)),
      }));
  }

  // トップレベル項目をロールフィルタ
  const filteredTopItems = topLevelItems.filter((item) => meetsRole(user?.role, item.adminOnly));

  // トップレベルの表示フィルタ (非表示モジュール)
  const visibleTopItems = editMode
    ? filteredTopItems
    : filteredTopItems.filter((item) => !hiddenModules.includes(item.to));

  // ヘルプ等の末尾に表示するアイテムを分離 (order >= 900)
  const mainTopItems = visibleTopItems.filter((item) => (item.order ?? 0) < 900);
  const bottomTopItems = visibleTopItems.filter((item) => (item.order ?? 0) >= 900);

  const canManage = canManageModules(user?.role);

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
        <span className="mobile-header-title">Actio</span>
      </div>

      {/* Overlay backdrop - mobile only */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Actio</h2>
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
        <nav style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, overflowY: "auto" }}>
          {/* トップレベルアイテム (Dashboard, Profile) */}
          {mainTopItems.map((item) => (
            <NavItemRow
              key={item.to}
              item={{ ...item, removable: item.removable }}
              editMode={editMode}
              hiddenModules={hiddenModules}
              onToggle={toggleModule}
            />
          ))}

          {/* セパレータ */}
          {mainTopItems.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", margin: "0.25rem 0.75rem" }} />
          )}

          {/* カテゴリ別 (予定 / タスク / その他機能) */}
          {CATEGORY_ORDER.map((cat) => (
            <NavCategorySection
              key={cat}
              category={cat}
              groups={filteredGroupsByCategory[cat]}
              editMode={editMode}
              hiddenModules={hiddenModules}
              collapsed={collapsedCategories.includes(cat)}
              collapsedGroups={collapsedGroups}
              canManage={canManage}
              onToggle={toggleModule}
              onCategoryCollapseToggle={toggleCategoryCollapse}
              onGroupCollapseToggle={toggleCollapse}
              onAddModule={handleAddModule}
            />
          ))}

          {/* 末尾アイテム (ヘルプ) */}
          {bottomTopItems.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid var(--border)", margin: "0.5rem 0.75rem 0.25rem" }} />
              {bottomTopItems.map((item) => (
                <NavItemRow
                  key={item.to}
                  item={item}
                  editMode={editMode}
                  hiddenModules={hiddenModules}
                  onToggle={toggleModule}
                />
              ))}
            </>
          )}
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
