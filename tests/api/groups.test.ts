import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  request,
} from "../helpers.js";

let app: any;
let adminToken: string;
let userId: string;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp();
});

beforeEach(async () => {
  clearTestDatabase();
  // Register admin user
  const reg = await request(app, "POST", "/api/auth/register", {
    body: { name: "Admin", email: "admin@test.com", password: "password123" },
  });
  adminToken = reg.json.accessToken;
  userId = reg.json.user.id;
});

describe("POST /api/groups", () => {
  it("should create a group", async () => {
    const { status, json } = await request(app, "POST", "/api/groups", {
      token: adminToken,
      body: { name: "TestGroup", description: "A test group" },
    });

    expect(status).toBe(201);
    expect(json.groupId).toBeDefined();
    expect(json.message).toBe("Group created");
  });
});

describe("GET /api/groups/my", () => {
  it("should list user groups", async () => {
    // Create a group first
    await request(app, "POST", "/api/groups", {
      token: adminToken,
      body: { name: "MyGroup" },
    });

    const { status, json } = await request(app, "GET", "/api/groups/my", {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(json.groups).toBeDefined();
    expect(Array.isArray(json.groups)).toBe(true);
  });
});

describe("GET /api/groups/:id", () => {
  it("should get group details", async () => {
    const create = await request(app, "POST", "/api/groups", {
      token: adminToken,
      body: { name: "DetailGroup" },
    });

    const groupId = create.json.groupId;
    const { status, json } = await request(app, "GET", `/api/groups/${groupId}`, {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(json.group).toBeDefined();
  });
});

describe("POST /api/groups/:id/join", () => {
  it("should join a group", async () => {
    // Create second user
    const reg2 = await request(app, "POST", "/api/auth/register", {
      body: { name: "User2", email: "user2@test.com", password: "password123" },
    });

    // Create group
    const create = await request(app, "POST", "/api/groups", {
      token: adminToken,
      body: { name: "JoinGroup" },
    });

    const { status } = await request(app, "POST", `/api/groups/${create.json.groupId}/join`, {
      token: reg2.json.accessToken,
    });

    expect(status).toBe(200);
  });
});

describe("POST /api/groups/:id/leave", () => {
  it("should leave a group", async () => {
    // Create second user and join
    const reg2 = await request(app, "POST", "/api/auth/register", {
      body: { name: "User2", email: "user2@test.com", password: "password123" },
    });

    const create = await request(app, "POST", "/api/groups", {
      token: adminToken,
      body: { name: "LeaveGroup" },
    });

    await request(app, "POST", `/api/groups/${create.json.groupId}/join`, {
      token: reg2.json.accessToken,
    });

    const { status } = await request(app, "POST", `/api/groups/${create.json.groupId}/leave`, {
      token: reg2.json.accessToken,
    });

    expect(status).toBe(200);
  });
});

describe("POST /api/groups/:id/schedules", () => {
  it("should add group schedule", async () => {
    const create = await request(app, "POST", "/api/groups", {
      token: adminToken,
      body: { name: "ScheduleGroup" },
    });

    const { status, json } = await request(app, "POST", `/api/groups/${create.json.groupId}/schedules`, {
      token: adminToken,
      body: { title: "GroupMeeting", day: 0, period: 0, duration: 1 },
    });

    expect(status).toBe(201);
    expect(json.schedule).toBeDefined();
  });
});
