/**
 * Schedule module — カレンダー・マイプラン・リマインダー
 */
import type { ModuleDefinition } from "../module-registry";

export const scheduleModule: ModuleDefinition = {
  id: "schedule",
  name: "スケジュール",
  description: "カレンダー・マイプランは予定、リマインダーはタスクに分類",
  menuGroups: [
    {
      id: "schedule",
      label: "スケジュール",
      icon: "C",
      order: 100,
      category: "event",
      items: [
        { to: "/calendar", label: "カレンダー", icon: "C", removable: true, order: 0 },
        { to: "/my-plan", label: "マイプラン", icon: "M", removable: true, order: 1 },
      ],
    },
    {
      id: "reminders",
      label: "リマインダー",
      icon: "R",
      order: 110,
      category: "task",
      items: [
        { to: "/reminders", label: "リマインダー", icon: "R", removable: true, order: 0 },
      ],
    },
  ],
};
