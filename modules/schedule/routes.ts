import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema, curriculumSchema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";
import { parseInstructorCSV, parseRoomCSV, parseCurriculumCSV } from "./csv-parser.js";
import { ScheduleGenerator } from "./scheduler.js";
import { executeSwap } from "./swap.js";
import type { Instructor, Curriculum, Room, ScheduleEntry, SwapRequest } from "../../src/shared/types.js";
import type { ScheduleMode } from "../../src/shared/constants.js";

const m1 = new Hono();

// In-memory state for current working schedule (pre-confirmation)
let workingInstructors: Instructor[] = [];
let workingCurricula: Curriculum[] = [];
let workingRooms: Room[] = [];
let workingEntries: ScheduleEntry[] = [];
let currentTermId = `term-${new Date().getFullYear()}`;

// ─── POST /api/m1/instructors/import ────────────────────────
m1.post("/instructors/import", async (c) => {
  const body = await c.req.text();
  const instructors = parseInstructorCSV(body);

  if (instructors.length === 0) {
    return c.json({ error: "No valid instructor data found" }, 400);
  }

  // Store in DB (curriculum module schema)
  for (const instr of instructors) {
    db.insert(curriculumSchema.instructors)
      .values({
        id: instr.id,
        name: instr.name,
        major: instr.major,
        courses: instr.courses,
        availability: instr.availability,
        availabilityConditionType: instr.availabilityConditionType,
        availabilityCondition: instr.availabilityCondition,
      })
      .onConflictDoNothing()
      .run();
  }

  workingInstructors = instructors;

  return c.json({
    imported: instructors.length,
    instructors: instructors.map((i) => ({
      id: i.id,
      name: i.name,
      major: i.major,
      courses: i.courses,
    })),
  });
});

// ─── POST /api/m1/rooms/import ──────────────────────────────
m1.post("/rooms/import", async (c) => {
  const body = await c.req.text();
  const rooms = parseRoomCSV(body);

  if (rooms.length === 0) {
    return c.json({ error: "No valid room data found" }, 400);
  }

  for (const room of rooms) {
    db.insert(schema.rooms)
      .values({
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        type: room.type,
        equipment: room.equipment,
      })
      .onConflictDoNothing()
      .run();
  }

  workingRooms = rooms;

  return c.json({
    imported: rooms.length,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
    })),
  });
});

// ─── POST /api/m1/curriculum/import ─────────────────────────
m1.post("/curriculum/import", async (c) => {
  const body = await c.req.text();

  // Build instructor name -> id map
  const instructorMap = new Map<string, string>();
  workingInstructors.forEach((i) => instructorMap.set(i.name, i.id));

  const curricula = parseCurriculumCSV(body, instructorMap);

  if (curricula.length === 0) {
    return c.json({ error: "No valid curriculum data found" }, 400);
  }

  for (const curr of curricula) {
    db.insert(curriculumSchema.curricula)
      .values({
        id: curr.id,
        name: curr.name,
        departmentName: curr.departmentName,
        instructorId: curr.instructorId,
        slotsPerSession: curr.slotsPerSession,
        totalSessions: curr.totalSessions,
        roomType: curr.roomType,
        editableUntil: curr.editableUntil,
        termId: curr.termId,
      })
      .onConflictDoNothing()
      .run();
  }

  workingCurricula = curricula;

  return c.json({
    imported: curricula.length,
    curricula: curricula.map((c) => ({
      id: c.id,
      name: c.name,
      departmentName: c.departmentName,
      slotsPerSession: c.slotsPerSession,
      totalSessions: c.totalSessions,
    })),
  });
});

// ─── POST /api/m1/schedule/generate ─────────────────────────
m1.post("/schedule/generate", async (c) => {
  const mode = (c.req.query("mode") as ScheduleMode) || "pack";

  if (workingInstructors.length === 0) {
    return c.json({ error: "No instructors loaded. Import instructors first." }, 400);
  }
  if (workingCurricula.length === 0) {
    return c.json({ error: "No curricula loaded. Import curricula first." }, 400);
  }
  if (workingRooms.length === 0) {
    return c.json({ error: "No rooms loaded. Import rooms first." }, 400);
  }

  const generator = new ScheduleGenerator(
    workingInstructors,
    workingCurricula,
    workingRooms,
    mode
  );

  const result = generator.generate();
  workingEntries = result.entries;

  return c.json(result);
});

// ─── GET /api/m1/schedule ───────────────────────────────────
m1.get("/schedule", async (c) => {
  // Return working entries if available, otherwise from DB
  if (workingEntries.length > 0) {
    return c.json({ entries: workingEntries, termId: currentTermId });
  }

  const dbEntries = db
    .select()
    .from(schema.scheduleEntries)
    .where(eq(schema.scheduleEntries.termId, currentTermId))
    .all();

  return c.json({ entries: dbEntries, termId: currentTermId });
});

// ─── POST /api/m1/schedule/swap ─────────────────────────────
m1.post("/schedule/swap", async (c) => {
  const body = await c.req.json<SwapRequest>();

  if (workingEntries.length === 0) {
    return c.json({ error: "No schedule generated yet" }, 400);
  }

  const result = executeSwap(
    body,
    workingEntries,
    workingInstructors,
    workingCurricula,
    workingRooms
  );

  if (result.success) {
    workingEntries = result.entries;
  }

  return c.json(result);
});

// ─── POST /api/m1/schedule/confirm ──────────────────────────
m1.post("/schedule/confirm", async (c) => {
  if (workingEntries.length === 0) {
    return c.json({ error: "No schedule to confirm" }, 400);
  }

  // Clear previous confirmed entries for this term
  db.delete(schema.scheduleEntries)
    .where(eq(schema.scheduleEntries.termId, currentTermId))
    .run();

  // Insert confirmed entries
  for (const entry of workingEntries) {
    db.insert(schema.scheduleEntries).values({
      id: uuidv4(),
      day: entry.day,
      period: entry.period,
      curriculumId: entry.curriculumId,
      roomId: entry.roomId,
      instructorId: entry.instructorId,
      candidateCount: entry.candidateCount,
      isConfirmed: true,
      termId: currentTermId,
    }).run();
  }

  return c.json({
    confirmed: workingEntries.length,
    termId: currentTermId,
    message: "Schedule confirmed and exported to M2",
  });
});

export { m1 };
