/**
 * Reservation module — 予約管理・施設予約・日程調整
 */
import type { ModuleDefinition } from "../module-registry";

export const reservationModule: ModuleDefinition = {
  id: "reservation",
  name: "予約管理",
  description: "施設予約・日程調整Votingなどの予約プラグイン",
  menuGroups: [
    {
      id: "reservation",
      label: "予約",
      icon: "B",
      order: 400,
      category: "event",
      items: [
        { to: "/reservations", label: "予約管理", icon: "B", removable: true, order: 0 },
        { to: "/voting", label: "日程調整", icon: "V", removable: true, order: 1 },
      ],
    },
  ],
};
