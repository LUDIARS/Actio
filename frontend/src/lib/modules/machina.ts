/**
 * M3 MACHINA module — タスク自動生成
 */
import type { ModuleDefinition } from "../module-registry";

export const machinaModule: ModuleDefinition = {
  id: "m3-machina",
  name: "M3 MACHINA",
  description: "Slack/Discord チャンネル監視 & タスク自動生成",
  menuGroups: [
    {
      id: "m3-machina",
      label: "M3 MACHINA",
      icon: "A",
      order: 600,
      category: "task",
      items: [
        { to: "/machina", label: "MACHINA", icon: "A", removable: true, order: 0 },
      ],
    },
  ],
};
