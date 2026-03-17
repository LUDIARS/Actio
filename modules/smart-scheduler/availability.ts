/**
 * グループ空き状況計算 (旧 auto-scheduler/availability.ts より移動)
 */

import { DAYS_COUNT, PERIODS_COUNT } from "../../src/shared/constants.js";
import type {
  UnifiedSlot,
  AvailabilitySlot,
} from "../../src/shared/types.js";

/**
 * Calculate group availability from member slot matrices.
 * - "fully available" = all members free
 * - "partially available" = ≥70% members free
 */
export function calculateGroupAvailability(
  memberSlots: { userId: string; slots: UnifiedSlot[][] }[],
  availableRoomsBySlot: Map<string, string[]>
): AvailabilitySlot[] {
  const totalMembers = memberSlots.length;
  if (totalMembers === 0) return [];

  const result: AvailabilitySlot[] = [];
  const threshold = Math.ceil(totalMembers * 0.7);

  for (let day = 0; day < DAYS_COUNT; day++) {
    for (let period = 0; period < PERIODS_COUNT; period++) {
      let freeCount = 0;

      for (const member of memberSlots) {
        const slot = member.slots[day]?.[period];
        if (slot && slot.status === "free") {
          freeCount++;
        }
      }

      const slotKey = `${day}-${period}`;
      const rooms = availableRoomsBySlot.get(slotKey) || [];

      const isFullyAvailable = freeCount === totalMembers;
      const isPartiallyAvailable = freeCount >= threshold;

      if (isFullyAvailable || isPartiallyAvailable) {
        result.push({
          day,
          period,
          availableCount: freeCount,
          totalMembers,
          isFullyAvailable,
          isPartiallyAvailable,
          availableRooms: rooms,
        });
      }
    }
  }

  return result;
}
