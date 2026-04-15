/**
 * Integration module — 外部連携・API管理
 */
import type { ModuleDefinition } from "../module-registry";

export const integrationModule: ModuleDefinition = {
  id: "integration",
  name: "外部連携",
  description: "Google Calendar・Notion連携、API キー管理",
  menuGroups: [
    {
      id: "integration",
      label: "外部連携",
      icon: "L",
      order: 800,
      category: "other",
      items: [
        { to: "/integrations", label: "連携設定", icon: "L", removable: true, order: 0 },
        { to: "/api-keys", label: "API連携", icon: "K", removable: true, order: 1 },
      ],
    },
  ],
};
