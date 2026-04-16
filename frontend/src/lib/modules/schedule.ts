/**
 * Schedule module — カレンダー・マイプラン・タスク
 */
import type { ModuleDefinition } from "../module-registry";

export const scheduleModule: ModuleDefinition = {
  id: "schedule",
  name: "スケジュール",
  description: "カレンダー・マイプランは予定、タスクはタスクに分類",
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
      id: "tasks",
      label: "タスク",
      icon: "T",
      order: 105,
      category: "task",
      items: [
        { to: "/tasks", label: "タスク", icon: "T", removable: true, order: 0 },
      ],
    },
  ],
};
