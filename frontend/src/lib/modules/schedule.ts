/**
 * Schedule module — カレンダー・マイプラン・リマインダー
 */
import type { ModuleDefinition } from "../module-registry";

export const scheduleModule: ModuleDefinition = {
  id: "schedule",
  name: "スケジュール",
  description: "カレンダー・マイプラン・リマインダーの管理",
  menuGroups: [
    {
      id: "schedule",
      label: "スケジュール",
      icon: "C",
      order: 100,
      items: [
        { to: "/calendar", label: "カレンダー", icon: "C", removable: true, order: 0 },
        { to: "/my-plan", label: "マイプラン", icon: "M", removable: true, order: 1 },
        { to: "/reminders", label: "リマインダー", icon: "R", removable: true, order: 2 },
      ],
    },
  ],
};
