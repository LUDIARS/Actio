/**
 * M1 School module — 学校カリキュラム管理
 */
import type { ModuleDefinition } from "../module-registry";

export const m1SchoolModule: ModuleDefinition = {
  id: "m1-school",
  name: "M1 学校管理",
  description: "学科・講師・カリキュラムのスキーマ管理とデータ配置",
  menuGroups: [
    {
      id: "m1-school",
      label: "M1 学校管理",
      icon: "S",
      order: 300,
      adminOnly: true,
      category: "event",
      items: [
        { to: "/schema-management", label: "スキーマ管理", icon: "S", adminOnly: true, removable: true, order: 0 },
        { to: "/data-management", label: "データ管理", icon: "D", adminOnly: true, removable: true, order: 1 },
      ],
    },
  ],
};
