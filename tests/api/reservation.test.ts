import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  insertTestGroup,
  insertTestRoom,
  request,
  generateTestToken,
} from "../helpers.js";

let app: any;

const USER_ID = "user-rsv-1";
const GROUP_ID = "group-rsv-1";
const ROOM_ID = "room-rsv-1";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: USER_ID, name: "RsvUser", email: "rsv@test.com" });
  insertTestGroup({ id: GROUP_ID, name: "RsvGroup", createdBy: USER_ID });
  insertTestRoom({ id: ROOM_ID, name: "Room A", capacity: 30, type: "classroom" });
});

const token = generateTestToken(USER_ID);

describe("POST /api/school/facility-booking/reservations", () => {
  it("should create a reservation", async () => {
    const { status, json } = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Meeting",
        day: 0,
        period: 0,
        roomId: ROOM_ID,
        participants: [USER_ID],
        note: "Test reservation",
      },
    });

    expect(status).toBe(201);
    expect(json.title).toBe("Meeting");
    expect(json.status).toBe("confirmed");
  });

  it("should reject invalid day/period", async () => {
    const { status } = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Bad",
        day: 8,
        period: 0,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    expect(status).toBe(400);
  });

  it("should detect room conflict", async () => {
    // First reservation
    await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "First",
        day: 1,
        period: 1,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    // Conflicting reservation
    const { status, json } = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Second",
        day: 1,
        period: 1,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    expect(status).toBe(409);
    expect(json.error).toContain("Conflict");
  });
});

describe("GET /api/school/facility-booking/reservations", () => {
  it("should list all reservations", async () => {
    await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Listed",
        day: 2,
        period: 2,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status, json } = await request(app, "GET", "/api/school/facility-booking/reservations", { token });

    expect(status).toBe(200);
    expect(json.reservations).toBeDefined();
    expect(json.reservations.length).toBe(1);
  });

  it("should filter by groupId", async () => {
    await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Grouped",
        day: 3,
        period: 3,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status, json } = await request(app, "GET", `/api/school/facility-booking/reservations?groupId=${GROUP_ID}`, { token });

    expect(status).toBe(200);
    expect(json.reservations.length).toBe(1);
  });
});

describe("GET /api/school/facility-booking/reservations/:id", () => {
  it("should get single reservation", async () => {
    const create = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Single",
        day: 4,
        period: 4,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status, json } = await request(app, "GET", `/api/school/facility-booking/reservations/${create.json.id}`, { token });

    expect(status).toBe(200);
    expect(json.title).toBe("Single");
  });

  it("should 404 for non-existent", async () => {
    const { status } = await request(app, "GET", "/api/school/facility-booking/reservations/nonexistent", { token });
    expect(status).toBe(404);
  });
});

describe("PUT /api/school/facility-booking/reservations/:id", () => {
  it("should update reservation with correct version", async () => {
    const create = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "ToUpdate",
        day: 0,
        period: 5,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status, json } = await request(app, "PUT", `/api/school/facility-booking/reservations/${create.json.id}`, {
      token,
      body: { title: "Updated", version: 1 },
    });

    expect(status).toBe(200);
    expect(json.title).toBe("Updated");
    expect(json.version).toBe(2);
  });

  it("should reject version conflict", async () => {
    const create = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "Conflict",
        day: 0,
        period: 6,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status } = await request(app, "PUT", `/api/school/facility-booking/reservations/${create.json.id}`, {
      token,
      body: { title: "Wrong Version", version: 99 },
    });

    expect(status).toBe(409);
  });
});

describe("DELETE /api/school/facility-booking/reservations/:id", () => {
  it("should cancel a reservation", async () => {
    const create = await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "ToCancel",
        day: 0,
        period: 7,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status, json } = await request(app, "DELETE", `/api/school/facility-booking/reservations/${create.json.id}`, { token });

    expect(status).toBe(200);
    expect(json.reservation.status).toBe("cancelled");
  });
});

describe("GET /api/school/facility-booking/rooms/:roomId/schedule", () => {
  it("should return room schedule", async () => {
    await request(app, "POST", "/api/school/facility-booking/reservations", {
      token,
      body: {
        groupId: GROUP_ID,
        title: "RoomSchedule",
        day: 0,
        period: 8,
        roomId: ROOM_ID,
        participants: [],
      },
    });

    const { status, json } = await request(app, "GET", `/api/school/facility-booking/rooms/${ROOM_ID}/schedule`, { token });

    expect(status).toBe(200);
    expect(json.roomId).toBe(ROOM_ID);
    expect(json.reservations).toBeDefined();
    expect(json.classSchedule).toBeDefined();
  });
});
