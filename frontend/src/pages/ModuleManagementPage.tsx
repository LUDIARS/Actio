import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  moduleRegistry,
  MENU_CATEGORY_LABELS,
  type MenuCategory,
  type MenuGroup,
} from "../lib/module-registry";

const HIDDEN_MODULES_KEY = "actio_hidden_modules";
const CATEGORIES: MenuCategory[] = ["event", "task", "other"];

function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_MODULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHidden(hidden: string[]) {
  localStorage.setItem(HIDDEN_MODULES_KEY, JSON.stringify(hidden));
}

function canManage(role: string | undefined): boolean {
  return role === "admin" || role === "group_leader";
}

export function ModuleManagementPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialCategory = (searchParams.get("category") ?? "event") as MenuCategory;
  const [activeCategory, setActiveCategory] = useState<MenuCategory>(
    CATEGORIES.includes(initialCategory) ? initialCategory : "event",
  );
  const [hidden, setHidden] = useState<string[]>(readHidden);

  // URL の category が変わったら切替
  useEffect(() => {
    const c = searchParams.get("category") as MenuCategory | null;
    if (c && CATEGORIES.includes(c)) {
      setActiveCategory(c);
    }
  }, [searchParams]);

  const groupsByCategory = useMemo(
    () => moduleRegistry.getMenuGroupsByCategory(),
    [],
  );

  const toggleItem = useCallback((to: string) => {
    setHidden((prev) => {
      const next = prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to];
      writeHidden(next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback(
    (group: MenuGroup, show: boolean) => {
      setHidden((prev) => {
        const ids = group.items.map((i) => i.to);
        const next = show
          ? prev.filter((h) => !ids.includes(h))
          : Array.from(new Set([...prev, ...ids]));
        writeHidden(next);
        return next;
      });
    },
    [],
  );

  const manageable = canManage(user?.role);

  const currentGroups = groupsByCategory[activeCategory] ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>モジュール管理</h1>
        <p>
          ダッシュボード・メニューに表示するモジュールを管理します。
          {manageable
            ? "管理者 / グループリーダーはモジュールの有効化・追加ができます。"
            : "閲覧のみ可能です (管理者権限が必要)。"}
        </p>
      </div>

      {/* カテゴリタブ */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1rem",
        }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom:
                activeCategory === cat
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              color:
                activeCategory === cat ? "var(--text)" : "var(--text-muted)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {MENU_CATEGORY_LABELS[cat]} ({groupsByCategory[cat]?.length ?? 0})
          </button>
        ))}
      </div>

      {/* 現在のカテゴリのモジュール一覧 */}
      {currentGroups.length === 0 ? (
        <div className="empty-state" style={{ padding: "2rem", textAlign: "center" }}>
          <p>{MENU_CATEGORY_LABELS[activeCategory]} に登録されているモジュールはありません。</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {currentGroups.map((group) => {
            const allHidden = group.items.every((i) => hidden.includes(i.to));
            return (
              <div key={group.id} className="card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                      {group.label}
                    </h3>
                    {group.adminOnly && (
                      <span
                        className="badge orange"
                        style={{ fontSize: "0.65rem", marginTop: "0.25rem" }}
                      >
                        管理者のみ
                      </span>
                    )}
                  </div>
                  {manageable && (
                    <button
                      onClick={() => toggleGroup(group, allHidden)}
                      style={{
                        padding: "0.3rem 0.75rem",
                        fontSize: "0.75rem",
                        background: allHidden ? "var(--accent)" : "var(--bg-surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: allHidden ? "#000" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      {allHidden ? "有効化" : "一括無効化"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {group.items.map((item) => {
                    const isHidden = hidden.includes(item.to);
                    return (
                      <div
                        key={item.to}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.4rem 0.5rem",
                          background: "var(--bg-surface-2)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.8rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 500,
                            textDecoration: isHidden ? "line-through" : "none",
                            color: isHidden ? "var(--text-muted)" : "var(--text)",
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                            fontFamily: "monospace",
                          }}
                        >
                          {item.to}
                        </span>
                        <span
                          className={`badge ${isHidden ? "red" : "green"}`}
                          style={{ fontSize: "0.65rem", marginLeft: "auto" }}
                        >
                          {isHidden ? "無効" : "有効"}
                        </span>
                        {manageable && item.removable !== false && (
                          <button
                            onClick={() => toggleItem(item.to)}
                            style={{
                              padding: "0.2rem 0.55rem",
                              fontSize: "0.7rem",
                              background: "transparent",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              color: isHidden ? "var(--green)" : "var(--red)",
                              cursor: "pointer",
                            }}
                          >
                            {isHidden ? "有効化" : "無効化"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新規モジュール追加 */}
      {manageable && (
        <div
          className="card"
          style={{
            marginTop: "1rem",
            borderStyle: "dashed",
            borderColor: "var(--border)",
          }}
        >
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            + {MENU_CATEGORY_LABELS[activeCategory]} にモジュールを追加
          </h3>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              marginBottom: "0.75rem",
            }}
          >
            新しいモジュールは <code>frontend/src/lib/modules/</code> 配下に定義し、
            <code>registerAllModules()</code> で登録します。カテゴリは
            <code>category: &quot;{activeCategory}&quot;</code> をモジュールの
            <code>menuGroups</code> に指定すると、このカテゴリ配下に自動配置されます。
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            動的モジュールロード (SDK plugin) は準備中です。バックエンドの
            <code>/api/admin/modules</code> から enable / disable 制御は可能です。
          </p>
        </div>
      )}
    </div>
  );
}
