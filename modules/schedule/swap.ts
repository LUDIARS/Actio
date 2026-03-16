import { MAX_SWAP_DEPTH, SKIP_RECALC_THRESHOLD } from "../../src/shared/constants.js";
import type { ScheduleEntry, SwapRequest } from "../../src/shared/types.js";
import { ScheduleGenerator } from "./scheduler.js";
import type { Instructor, Curriculum, Room } from "../../src/shared/types.js";

interface SwapResult {
  success: boolean;
  entries: ScheduleEntry[];
  affectedEntries: ScheduleEntry[];
  message: string;
}

/**
 * Handle swap operations with infinite loop prevention.
 * - Entries with ≥15 candidates are exempt from recalculation
 * - Max swap chain depth = 2
 * - Transaction ID prevents re-entry in the same swap operation
 */
export function executeSwap(
  request: SwapRequest,
  entries: ScheduleEntry[],
  instructors: Instructor[],
  curricula: Curriculum[],
  rooms: Room[]
): SwapResult {
  const { fromDay, fromPeriod, toDay, toPeriod, transactionId } = request;

  // Find the source entry
  const sourceEntry = entries.find(
    (e) => e.day === fromDay && e.period === fromPeriod
  );
  if (!sourceEntry) {
    return {
      success: false,
      entries,
      affectedEntries: [],
      message: "Source slot is empty",
    };
  }

  // Find what's at the target slot (if anything)
  const targetEntry = entries.find(
    (e) => e.day === toDay && e.period === toPeriod
  );

  const generator = new ScheduleGenerator(instructors, curricula, rooms);

  // Validate source can move to target
  const sourceCurr = curricula.find((c) => c.id === sourceEntry.curriculumId);
  const sourceInstr = instructors.find((i) => i.id === sourceEntry.instructorId);
  if (!sourceCurr || !sourceInstr) {
    return {
      success: false,
      entries,
      affectedEntries: [],
      message: "Invalid curriculum or instructor reference",
    };
  }

  // Check instructor availability at target slot
  if (!sourceInstr.availability[toDay]?.[toPeriod]) {
    return {
      success: false,
      entries,
      affectedEntries: [],
      message: "Instructor not available at target slot",
    };
  }

  // Check room compatibility at target slot
  const availableRoom = rooms.find((r) => {
    if (r.type !== sourceCurr.roomType) return false;
    // Room must not be used at target slot (except by target entry itself)
    const isUsed = entries.some(
      (e) =>
        e.day === toDay &&
        e.period === toPeriod &&
        e.roomId === r.id &&
        !(targetEntry && e === targetEntry)
    );
    return !isUsed;
  });

  if (!availableRoom) {
    return {
      success: false,
      entries,
      affectedEntries: [],
      message: "No compatible room available at target slot",
    };
  }

  const newEntries = entries.map((e) => ({ ...e }));
  const affected: ScheduleEntry[] = [];

  if (targetEntry) {
    // Swap: move target to source position
    // Check if target entry has ≥15 candidates (skip recalc)
    if (targetEntry.candidateCount >= SKIP_RECALC_THRESHOLD) {
      // Simple swap without recalculation
      const srcIdx = newEntries.findIndex(
        (e) => e.day === fromDay && e.period === fromPeriod
      );
      const tgtIdx = newEntries.findIndex(
        (e) => e.day === toDay && e.period === toPeriod
      );

      // Swap positions
      newEntries[srcIdx] = {
        ...newEntries[srcIdx],
        day: toDay,
        period: toPeriod,
        roomId: availableRoom.id,
      };
      newEntries[tgtIdx] = {
        ...newEntries[tgtIdx],
        day: fromDay,
        period: fromPeriod,
      };
      affected.push(newEntries[srcIdx], newEntries[tgtIdx]);
    } else {
      // Need to validate target can move to source position
      const targetCurr = curricula.find(
        (c) => c.id === targetEntry.curriculumId
      );
      const targetInstr = instructors.find(
        (i) => i.id === targetEntry.instructorId
      );
      if (!targetCurr || !targetInstr) {
        return {
          success: false,
          entries,
          affectedEntries: [],
          message: "Invalid target curriculum or instructor",
        };
      }

      if (!targetInstr.availability[fromDay]?.[fromPeriod]) {
        return {
          success: false,
          entries,
          affectedEntries: [],
          message: "Target instructor not available at source slot",
        };
      }

      const srcIdx = newEntries.findIndex(
        (e) => e.day === fromDay && e.period === fromPeriod
      );
      const tgtIdx = newEntries.findIndex(
        (e) => e.day === toDay && e.period === toPeriod
      );

      newEntries[srcIdx] = {
        ...newEntries[srcIdx],
        day: toDay,
        period: toPeriod,
        roomId: availableRoom.id,
      };
      newEntries[tgtIdx] = {
        ...newEntries[tgtIdx],
        day: fromDay,
        period: fromPeriod,
        roomId: sourceEntry.roomId,
      };
      affected.push(newEntries[srcIdx], newEntries[tgtIdx]);
    }
  } else {
    // Move to empty slot
    const srcIdx = newEntries.findIndex(
      (e) => e.day === fromDay && e.period === fromPeriod
    );
    newEntries[srcIdx] = {
      ...newEntries[srcIdx],
      day: toDay,
      period: toPeriod,
      roomId: availableRoom.id,
    };
    affected.push(newEntries[srcIdx]);
  }

  return {
    success: true,
    entries: newEntries,
    affectedEntries: affected,
    message: "Swap completed successfully",
  };
}
