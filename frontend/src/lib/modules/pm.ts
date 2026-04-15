/**
 * M2 PM module — プロジェクト管理
 */
import type { ModuleDefinition } from "../module-registry";

export const pmModule: ModuleDefinition = {
  id: "m2-pm",
  name: "M2 PM",
  description: "GitHub/Notion タスク同期・分析・プロジェクト管理",
  menuGroups: [
    {
      id: "m2-pm",
      label: "M2 PM",
      icon: "P",
      order: 500,
      category: "task",
      items: [
        { to: "/pm", label: "ダッシュボード", icon: "P", removable: true, order: 0 },
      ],
    },
  ],
};
