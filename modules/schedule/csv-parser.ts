import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import { DAYS_COUNT, PERIODS_COUNT, DAY_LABELS } from "../../src/shared/constants.js";
import type { Instructor, Curriculum, Room } from "../../src/shared/types.js";
import type { RoomType } from "../../src/shared/constants.js";

/**
 * Parse instructor CSV.
 * Format: 名前,専攻,担当科目1,担当科目2,...,月1,月2,...,日11
 * Availability columns: 1=available, 0 or empty=unavailable
 */
export function parseInstructorCSV(csvContent: string): Instructor[] {
  const records: string[][] = parse(csvContent, {
    skip_empty_lines: true,
    relax_column_count: true,
  });

  if (records.length < 2) return [];

  const header = records[0];
  const dataRows = records.slice(1);

  // Find where availability columns start
  // Availability columns are named like: 月1, 月2, ..., 日11
  const availStartIdx = header.findIndex((h) => {
    const trimmed = h.trim();
    return DAY_LABELS.some((d) => trimmed.startsWith(d));
  });

  return dataRows.map((row) => {
    const name = row[0]?.trim() || "";
    const major = row[1]?.trim() || "";

    // Courses: columns between major and availability
    const courseEndIdx = availStartIdx > 0 ? availStartIdx : row.length;
    const courses = row
      .slice(2, courseEndIdx)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // Availability: 7 days × 11 periods
    const availability: boolean[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array(PERIODS_COUNT).fill(false)
    );

    if (availStartIdx > 0) {
      for (let day = 0; day < DAYS_COUNT; day++) {
        for (let period = 0; period < PERIODS_COUNT; period++) {
          const colIdx = availStartIdx + day * PERIODS_COUNT + period;
          const val = row[colIdx]?.trim();
          availability[day][period] = val === "1";
        }
      }
    }

    return {
      id: uuidv4(),
      name,
      major,
      courses,
      availability,
      availabilityConditionType: "any" as const,
      availabilityCondition: {},
    };
  });
}

/**
 * Parse room CSV.
 * Format: 教室ID,教室名,定員,タイプ,設備1,設備2,...
 */
export function parseRoomCSV(csvContent: string): Room[] {
  const records: string[][] = parse(csvContent, {
    skip_empty_lines: true,
    relax_column_count: true,
  });

  if (records.length < 2) return [];
  const dataRows = records.slice(1);

  return dataRows.map((row) => ({
    id: row[0]?.trim() || uuidv4(),
    name: row[1]?.trim() || "",
    capacity: parseInt(row[2]?.trim() || "0", 10),
    type: (row[3]?.trim() || "講義室") as RoomType,
    equipment: row
      .slice(4)
      .map((e) => e.trim())
      .filter((e) => e.length > 0),
  }));
}

/**
 * Parse curriculum CSV.
 * Format: 科目名,学科,担当講師,コマ数/回,開催回数,教室タイプ
 */
export function parseCurriculumCSV(
  csvContent: string,
  instructorMap: Map<string, string>,
  editableUntil?: Date
): Curriculum[] {
  const records: string[][] = parse(csvContent, {
    skip_empty_lines: true,
    relax_column_count: true,
  });

  if (records.length < 2) return [];
  const dataRows = records.slice(1);

  return dataRows.map((row) => {
    const instructorName = row[2]?.trim() || "";
    const instructorId = instructorMap.get(instructorName) || "";

    return {
      id: uuidv4(),
      name: row[0]?.trim() || "",
      departmentName: row[1]?.trim() || "",
      instructorId,
      slotsPerSession: parseInt(row[3]?.trim() || "1", 10),
      totalSessions: parseInt(row[4]?.trim() || "1", 10),
      roomType: (row[5]?.trim() || "講義室") as RoomType,
      roomId: null,
      editableUntil: editableUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      termId: `term-${new Date().getFullYear()}`,
    };
  });
}
