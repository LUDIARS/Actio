/**
 * Core module — ダッシュボード・プロフィール・ヘルプ
 */
import type { ModuleDefinition } from "../module-registry";

export const coreModule: ModuleDefinition = {
  id: "core",
  name: "コア",
  description: "ダッシュボード・プロフィール・ヘルプなど基本機能",
  menuItems: [
    { to: "/", label: "Dashboard", icon: "H", order: 0 },
    { to: "/profile", label: "プロフィール", icon: "P", order: 1 },
    { to: "/help", label: "ヘルプ", icon: "?", order: 900 },
  ],
};
