/**
 * Tasks module — タスク
 *
 * 旧 schedule.ts。スケジュール (カレンダー/マイプラン) menuGroup は
 * Schedula に分離 (2026-05-20 split-task-only)。
 */
import type { ModuleDefinition } from "../module-registry";

export const tasksModule: ModuleDefinition = {
  id: "tasks",
  name: "タスク",
  description: "タスク管理",
  menuGroups: [
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
