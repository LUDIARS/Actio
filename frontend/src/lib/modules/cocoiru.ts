/**
 * Cocoiru module — オプトイン式の在席シェアリング
 *
 * 「私いまバンタンのこのフロアにいるよ」をグループメンバーに公開する。
 * Schedula 側プラグイン: `@ludiars/schedula-module-cocoiru`
 * Actio 側 UI: `pages/CocoiruPage.tsx`
 */
import type { ModuleDefinition } from "../module-registry";

export const cocoiruModule: ModuleDefinition = {
  id: "cocoiru",
  name: "ココイル",
  description:
    "オプトイン式の在席シェアリング。WiFi SSID / GPS / スケジュールから「いま何階にいるか」をグループに公開",
  menuGroups: [
    {
      id: "cocoiru",
      label: "ココイル",
      icon: "C",
      order: 800,
      category: "other",
      items: [
        { to: "/cocoiru", label: "在席シェア", icon: "C", removable: true, order: 0 },
      ],
    },
  ],
};
