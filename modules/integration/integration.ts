import { DAYS_COUNT, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { UnifiedSlot, MemberProfile } from "../../src/shared/types.js";
import type { SlotStatus } from "../../src/shared/constants.js";

/**
 * Create an empty 7×11 slot matrix with all slots free.
 */
export function createEmptySlotMatrix(): UnifiedSlot[][] {
  return Array.from({ length: DAYS_COUNT }, (_, day) =>
    Array.from({ length: PERIODS_COUNT }, (_, period) => ({
      day,
      period,
      status: "free" as SlotStatus,
      majorLabel: null,
      isPrivate: false,
      sourceModule: "init",
    }))
  );
}

/**
 * Merge class schedule entries into a slot matrix.
 * Privacy: only expose major label, not course name.
 */
export function mergeClassSchedule(
  matrix: UnifiedSlot[][],
  entries: { day: number; period: number; major: string }[]
): UnifiedSlot[][] {
  const result = matrix.map((row) => row.map((s) => ({ ...s })));

  for (const entry of entries) {
    if (entry.day >= 0 && entry.day < DAYS_COUNT && entry.period >= 0 && entry.period < PERIODS_COUNT) {
      result[entry.day][entry.period] = {
        day: entry.day,
        period: entry.period,
        status: "class",
        majorLabel: entry.major,
        isPrivate: false,
        sourceModule: "M1",
      };
    }
  }

  return result;
}

/**
 * Merge personal calendar events into a slot matrix.
 * Privacy: events are marked as private.
 */
export function mergePersonalEvents(
  matrix: UnifiedSlot[][],
  events: { day: number; period: number }[]
): UnifiedSlot[][] {
  const result = matrix.map((row) => row.map((s) => ({ ...s })));

  for (const event of events) {
    if (
      event.day >= 0 && event.day < DAYS_COUNT &&
      event.period >= 0 && event.period < PERIODS_COUNT &&
      result[event.day][event.period].status === "free"
    ) {
      result[event.day][event.period] = {
        day: event.day,
        period: event.period,
        status: "personal",
        majorLabel: null,
        isPrivate: true,
        sourceModule: "GCal",
      };
    }
  }

  return result;
}

/**
 * Merge school-wide events into a slot matrix.
 * These are public (not private).
 */
export function mergeSchoolEvents(
  matrix: UnifiedSlot[][],
  events: { day: number; period: number; label: string }[]
): UnifiedSlot[][] {
  const result = matrix.map((row) => row.map((s) => ({ ...s })));

  for (const event of events) {
    if (event.day >= 0 && event.day < DAYS_COUNT && event.period >= 0 && event.period < PERIODS_COUNT) {
      result[event.day][event.period] = {
        day: event.day,
        period: event.period,
        status: "event",
        majorLabel: event.label,
        isPrivate: false,
        sourceModule: "GCal",
      };
    }
  }

  return result;
}

/**
 * Merge reservation data (M4 feedback) into a slot matrix.
 */
export function mergeReservations(
  matrix: UnifiedSlot[][],
  reservations: { day: number; period: number; title: string }[]
): UnifiedSlot[][] {
  const result = matrix.map((row) => row.map((s) => ({ ...s })));

  for (const res of reservations) {
    if (res.day >= 0 && res.day < DAYS_COUNT && res.period >= 0 && res.period < PERIODS_COUNT) {
      result[res.day][res.period] = {
        day: res.day,
        period: res.period,
        status: "reserved",
        majorLabel: res.title,
        isPrivate: false,
        sourceModule: "M4",
      };
    }
  }

  return result;
}

/**
 * Apply privacy rules to a slot matrix for external viewing.
 * - Class slots: only show major label
 * - Personal slots: show "予定あり" only
 * - School events: full visibility
 * - Reservations: full visibility (public info)
 */
export function applyPrivacyFilter(
  matrix: UnifiedSlot[][],
  isOwner: boolean
): UnifiedSlot[][] {
  if (isOwner) return matrix;

  return matrix.map((row) =>
    row.map((slot) => {
      if (slot.status === "personal") {
        return {
          ...slot,
          majorLabel: null,
          isPrivate: true,
        };
      }
      if (slot.status === "class") {
        // Only show major, not course name
        return {
          ...slot,
          isPrivate: false,
        };
      }
      return slot;
    })
  );
}

/**
 * Calculate attendance days from a slot matrix.
 * A day is an "attendance day" if the member has at least one class on that day.
 */
export function calculateAttendanceDays(matrix: UnifiedSlot[][]): number[] {
  const days: number[] = [];
  for (let day = 0; day < DAYS_COUNT; day++) {
    const hasClass = matrix[day].some((slot) => slot.status === "class");
    if (hasClass) days.push(day);
  }
  return days;
}
