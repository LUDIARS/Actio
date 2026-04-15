/**
 * M5 Notification module — 通知管理
 */
import type { ModuleDefinition } from "../module-registry";

export const notificationModule: ModuleDefinition = {
  id: "m5-notification",
  name: "M5 通知",
  description: "Webhook通知の設定・管理",
  menuGroups: [
    {
      id: "m5-notification",
      label: "M5 通知",
      icon: "N",
      order: 700,
      category: "task",
      items: [
        { to: "/notifications", label: "通知管理", icon: "N", removable: true, order: 0 },
      ],
    },
  ],
};
