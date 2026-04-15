/**
 * Group module — グループ管理
 */
import type { ModuleDefinition } from "../module-registry";

export const groupModule: ModuleDefinition = {
  id: "group",
  name: "グループ",
  description: "グループの管理・メンバー管理・グループスケジュール",
  menuGroups: [
    {
      id: "group",
      label: "グループ",
      icon: "G",
      order: 200,
      category: "event",
      items: [
        { to: "/groups", label: "グループ管理", icon: "G", removable: true, order: 0 },
      ],
    },
  ],
};
