import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;

const USER_ID = "user-m1-1";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp();
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: USER_ID, name: "M1User", email: "m1@test.com", role: "admin" });
});

const token = generateTestToken(USER_ID, "admin");

describe("Departments", () => {
  it("GET /api/m1/departments should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/m1/departments", { token });
    expect(status).toBe(200);
    expect(json.departments).toBeDefined();
  });

  it("POST /api/m1/departments should create department", async () => {
    const { status, json } = await request(app, "POST", "/api/m1/departments", {
      token,
      body: { name: "Computer Science" },
    });

    expect(status).toBe(201);
  });

  it("PUT /api/m1/departments/:id should update", async () => {
    const create = await request(app, "POST", "/api/m1/departments", {
      token,
      body: { name: "CS" },
    });

    // Get all departments to find the id
    const list = await request(app, "GET", "/api/m1/departments", { token });
    const deptId = list.json.departments[0].id;

    const { status } = await request(app, "PUT", `/api/m1/departments/${deptId}`, {
      token,
      body: { name: "Computer Science (Updated)" },
    });

    expect(status).toBe(200);
  });

  it("DELETE /api/m1/departments/:id should delete", async () => {
    await request(app, "POST", "/api/m1/departments", {
      token,
      body: { name: "ToDelete" },
    });

    const list = await request(app, "GET", "/api/m1/departments", { token });
    const deptId = list.json.departments[0].id;

    const { status } = await request(app, "DELETE", `/api/m1/departments/${deptId}`, { token });
    expect(status).toBe(200);
  });
});

describe("Instructors", () => {
  it("GET /api/m1/instructors should return list", async () => {
    const { status, json } = await request(app, "GET", "/api/m1/instructors", { token });
    expect(status).toBe(200);
    expect(json.instructors).toBeDefined();
  });

  it("POST /api/m1/instructors should create instructor", async () => {
    const { status } = await request(app, "POST", "/api/m1/instructors", {
      token,
      body: { name: "Dr. Smith" },
    });

    expect(status).toBe(201);
  });
});

describe("Curricula", () => {
  it("should CRUD curriculum within department", async () => {
    // Create department first
    await request(app, "POST", "/api/m1/departments", {
      token,
      body: { name: "Math" },
    });

    const depts = await request(app, "GET", "/api/m1/departments", { token });
    const deptId = depts.json.departments[0].id;

    // Create curriculum
    const { status: createStatus } = await request(app, "POST", `/api/m1/departments/${deptId}/curricula`, {
      token,
      body: { name: "Linear Algebra", periods: 2 },
    });

    expect(createStatus).toBe(201);

    // List curricula
    const { status: listStatus, json: listJson } = await request(
      app, "GET", `/api/m1/departments/${deptId}/curricula`, { token }
    );

    expect(listStatus).toBe(200);
    expect(listJson.curricula.length).toBe(1);
  });
});
