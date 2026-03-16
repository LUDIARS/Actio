import { DAYS_COUNT, PERIODS_COUNT, SKIP_RECALC_THRESHOLD } from "../../src/shared/constants.js";
import type {
  Instructor,
  Curriculum,
  Room,
  ScheduleEntry,
  ScheduleGenerationResult,
} from "../../src/shared/types.js";
import type { ScheduleMode } from "../../src/shared/constants.js";

interface SlotKey {
  day: number;
  period: number;
}

interface PlacementState {
  /** grid[day][period] -> ScheduleEntry or null */
  grid: (ScheduleEntry | null)[][];
  /** Track room usage: `${day}-${period}-${roomId}` -> true */
  roomUsage: Set<string>;
  /** Track instructor usage: `${day}-${period}-${instructorId}` -> true */
  instructorUsage: Set<string>;
}

/**
 * CSP-based schedule generator using MRV heuristic + backtracking.
 */
export class ScheduleGenerator {
  private instructors: Map<string, Instructor>;
  private curricula: Curriculum[];
  private rooms: Room[];
  private mode: ScheduleMode;

  constructor(
    instructors: Instructor[],
    curricula: Curriculum[],
    rooms: Room[],
    mode: ScheduleMode = "pack"
  ) {
    this.instructors = new Map(instructors.map((i) => [i.id, i]));
    this.curricula = curricula;
    this.rooms = rooms;
    this.mode = mode;
  }

  /**
   * Generate a schedule by placing all curricula into time slots.
   */
  generate(): ScheduleGenerationResult {
    const state = this.createEmptyState();

    // Expand curricula: each curriculum needs `weeklySlots` placements
    const placements: { curriculum: Curriculum; index: number }[] = [];
    for (const c of this.curricula) {
      for (let i = 0; i < c.slotsPerSession * c.totalSessions; i++) {
        placements.push({ curriculum: c, index: i });
      }
    }

    // Calculate candidate count for each placement and sort by MRV
    const withCandidates = placements.map((p) => ({
      ...p,
      candidates: this.getCandidateSlots(p.curriculum, state),
    }));

    // MRV: sort by fewest candidates first
    withCandidates.sort((a, b) => a.candidates.length - b.candidates.length);

    const entries: ScheduleEntry[] = [];
    const unplaced: string[] = [];

    // Backtracking placement
    const placed = this.backtrack(withCandidates, 0, state, entries);

    if (!placed) {
      // Collect unplaced items
      const placedCurrIds = new Set(entries.map((e) => e.curriculumId));
      for (const p of withCandidates) {
        if (!placedCurrIds.has(p.curriculum.id)) {
          if (!unplaced.includes(p.curriculum.name)) {
            unplaced.push(p.curriculum.name);
          }
        }
      }
    }

    return {
      entries,
      unplaced,
      stats: {
        totalCurricula: placements.length,
        placed: entries.length,
        unplaced: placements.length - entries.length,
        mode: this.mode,
      },
    };
  }

  private createEmptyState(): PlacementState {
    const grid: (ScheduleEntry | null)[][] = Array.from(
      { length: DAYS_COUNT },
      () => Array(PERIODS_COUNT).fill(null)
    );
    return {
      grid,
      roomUsage: new Set(),
      instructorUsage: new Set(),
    };
  }

  private backtrack(
    items: { curriculum: Curriculum; index: number; candidates: SlotKey[] }[],
    idx: number,
    state: PlacementState,
    entries: ScheduleEntry[]
  ): boolean {
    if (idx >= items.length) return true;

    const item = items[idx];
    // Recalculate candidates with current state
    const candidates = this.getCandidateSlots(item.curriculum, state);

    // Apply mode-specific ordering
    const orderedCandidates = this.orderByMode(candidates, item.curriculum, state);

    for (const slot of orderedCandidates) {
      const room = this.findAvailableRoom(
        item.curriculum.roomType,
        slot.day,
        slot.period,
        state
      );
      if (!room) continue;

      const entry: ScheduleEntry = {
        day: slot.day,
        period: slot.period,
        curriculumId: item.curriculum.id,
        roomId: room.id,
        instructorId: item.curriculum.instructorId,
        candidateCount: candidates.length,
      };

      // Place
      this.placeEntry(entry, state);
      entries.push(entry);

      if (this.backtrack(items, idx + 1, state, entries)) {
        return true;
      }

      // Undo
      entries.pop();
      this.removeEntry(entry, state);
    }

    return false;
  }

  /**
   * Get all valid candidate slots for a curriculum.
   */
  private getCandidateSlots(
    curriculum: Curriculum,
    state: PlacementState
  ): SlotKey[] {
    const instructor = this.instructors.get(curriculum.instructorId);
    if (!instructor) return [];

    const candidates: SlotKey[] = [];

    for (let day = 0; day < DAYS_COUNT; day++) {
      for (let period = 0; period < PERIODS_COUNT; period++) {
        // Check instructor availability
        if (!instructor.availability[day]?.[period]) continue;

        // Check instructor not already booked
        const instrKey = `${day}-${period}-${curriculum.instructorId}`;
        if (state.instructorUsage.has(instrKey)) continue;

        // Check if there's a compatible room available
        const hasRoom = this.rooms.some((r) => {
          if (r.type !== curriculum.roomType) return false;
          const roomKey = `${day}-${period}-${r.id}`;
          return !state.roomUsage.has(roomKey);
        });
        if (!hasRoom) continue;

        candidates.push({ day, period });
      }
    }

    return candidates;
  }

  /**
   * Order candidates based on scheduling mode.
   */
  private orderByMode(
    candidates: SlotKey[],
    _curriculum: Curriculum,
    _state: PlacementState
  ): SlotKey[] {
    if (this.mode === "pack") {
      // Pack mode: prefer earlier days and periods
      return [...candidates].sort((a, b) => {
        if (a.day !== b.day) return a.day - b.day;
        return a.period - b.period;
      });
    } else {
      // Spread mode: distribute across days using round-robin
      return [...candidates].sort((a, b) => {
        // Count how many entries are already on each day
        const aDayCount = this.countEntriesOnDay(a.day, _state);
        const bDayCount = this.countEntriesOnDay(b.day, _state);
        if (aDayCount !== bDayCount) return aDayCount - bDayCount;
        return a.period - b.period;
      });
    }
  }

  private countEntriesOnDay(day: number, state: PlacementState): number {
    let count = 0;
    for (let p = 0; p < PERIODS_COUNT; p++) {
      if (state.grid[day][p] !== null) count++;
    }
    return count;
  }

  private findAvailableRoom(
    roomType: string,
    day: number,
    period: number,
    state: PlacementState
  ): Room | null {
    return (
      this.rooms.find((r) => {
        if (r.type !== roomType) return false;
        const key = `${day}-${period}-${r.id}`;
        return !state.roomUsage.has(key);
      }) || null
    );
  }

  private placeEntry(entry: ScheduleEntry, state: PlacementState): void {
    state.grid[entry.day][entry.period] = entry;
    state.roomUsage.add(`${entry.day}-${entry.period}-${entry.roomId}`);
    state.instructorUsage.add(
      `${entry.day}-${entry.period}-${entry.instructorId}`
    );
  }

  private removeEntry(entry: ScheduleEntry, state: PlacementState): void {
    state.grid[entry.day][entry.period] = null;
    state.roomUsage.delete(`${entry.day}-${entry.period}-${entry.roomId}`);
    state.instructorUsage.delete(
      `${entry.day}-${entry.period}-${entry.instructorId}`
    );
  }

  /**
   * Find swap candidates for a placed entry.
   * Returns all slots where the entry could be moved to.
   */
  getSwapCandidates(
    entry: ScheduleEntry,
    allEntries: ScheduleEntry[]
  ): { day: number; period: number; candidateCount: number; color: string }[] {
    const state = this.createEmptyState();

    // Rebuild state from all entries except the one being swapped
    for (const e of allEntries) {
      if (e.day === entry.day && e.period === entry.period) continue;
      this.placeEntry(e, state);
    }

    const curriculum = this.curricula.find(
      (c) => c.id === entry.curriculumId
    );
    if (!curriculum) return [];

    const candidates = this.getCandidateSlots(curriculum, state);

    return candidates.map((slot) => {
      const count = candidates.length;
      let color: string;
      if (count >= SKIP_RECALC_THRESHOLD) {
        color = "#3FB950"; // green
      } else if (count >= 4) {
        color = "#D29922"; // orange
      } else {
        color = "#6E7681"; // gray
      }
      return { day: slot.day, period: slot.period, candidateCount: count, color };
    });
  }
}
