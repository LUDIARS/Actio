import { DAYS_COUNT, PERIODS_COUNT } from "../../src/shared/constants.js";
import type {
  UnifiedSlot,
  AvailabilitySlot,
  MeetingSuggestion,
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

/**
 * Rank meeting suggestions based on scoring criteria.
 *
 * Scoring:
 * - +10 per available member
 * - +20 if all members have attendance on that day
 * - +15 if room is available
 * - +5 if adjacent slots are also available (extensible meeting)
 * - -5 if Saturday or Sunday (day 5 or 6)
 */
export function rankMeetingSuggestions(
  availabilitySlots: AvailabilitySlot[],
  memberAttendanceDays: Map<string, number[]>,
  allMemberIds: string[]
): MeetingSuggestion[] {
  const suggestions: MeetingSuggestion[] = [];

  // Build a lookup for quick adjacency checks
  const slotLookup = new Map<string, AvailabilitySlot>();
  for (const slot of availabilitySlots) {
    slotLookup.set(`${slot.day}-${slot.period}`, slot);
  }

  for (const slot of availabilitySlots) {
    let score = 0;
    const reasons: string[] = [];

    // +10 per available person
    score += slot.availableCount * 10;
    reasons.push(`参加可能: ${slot.availableCount}/${slot.totalMembers}人`);

    // +20 if all members attend school on this day
    const allAttend = allMemberIds.every((id) => {
      const days = memberAttendanceDays.get(id);
      return days?.includes(slot.day);
    });
    if (allAttend) {
      score += 20;
      reasons.push("全員登校日");
    }

    // +15 if rooms available
    if (slot.availableRooms.length > 0) {
      score += 15;
      reasons.push(`空き教室: ${slot.availableRooms.length}室`);
    }

    // +5 if adjacent slots are available
    const prevKey = `${slot.day}-${slot.period - 1}`;
    const nextKey = `${slot.day}-${slot.period + 1}`;
    if (slotLookup.has(prevKey) || slotLookup.has(nextKey)) {
      score += 5;
      reasons.push("連続コマ可");
    }

    // -5 for weekends (Saturday=5, Sunday=6)
    if (slot.day >= 5) {
      score -= 5;
      reasons.push("週末ペナルティ");
    }

    suggestions.push({
      day: slot.day,
      period: slot.period,
      score,
      availableCount: slot.availableCount,
      totalMembers: slot.totalMembers,
      availableRooms: slot.availableRooms,
      reasons,
    });
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions;
}
