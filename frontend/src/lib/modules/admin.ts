/**
 * Admin module — 管理者機能
 */
import type { ModuleDefinition } from "../module-registry";

export const adminModule: ModuleDefinition = {
  id: "admin",
  name: "管理",
  description: "ユーザー管理・設定・ログ・DB・シークレット",
  menuGroups: [
    {
      id: "admin",
      label: "管理",
      icon: "X",
      order: 999,
      category: "other",
      items: [
        { to: "/admin/users", label: "ユーザー管理", icon: "U", order: 0 },
        { to: "/admin/modules", label: "モジュール管理", icon: "M", order: 1 },
        { to: "/admin/settings", label: "設定", icon: "S", adminOnly: true, order: 2 },
        { to: "/admin/activity-logs", label: "操作ログ", icon: "L", adminOnly: true, order: 3 },
        { to: "/admin/db", label: "DB Viewer", icon: "D", adminOnly: true, order: 4 },
        { to: "/admin/secrets", label: "シークレット", icon: "K", adminOnly: true, order: 5 },
      ],
    },
  ],
};
