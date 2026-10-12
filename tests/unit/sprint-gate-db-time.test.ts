import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migratePlanning } from "../../src/db/planning-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";
import { SprintGateStore } from "../../modules/task/sprint-gates/store.js";
import { SprintStore } from "../../modules/task/planning/sprint-store.js";
import { toEpochSeconds } from "../../modules/task/sprint-gates/db-time.js";

describe("toEpochSeconds", () => {
    it("keeps SQLite epoch seconds and empty values", () => {
        expect(toEpochSeconds(1791000000)).toBe(1791000000);
        expect(toEpochSeconds(null)).toBeNull();
        expect(toEpochSeconds(undefined)).toBeNull();
    });
    it("reads PostgreSQL timestamp text as UTC", () => {
        expect(toEpochSeconds("2026-10-11 22:47:44.366")).toBe(Math.floor(Date.UTC(2026, 9, 11, 22, 47, 44) / 1000));
        expect(toEpochSeconds("2026-10-11T22:47:44.366Z")).toBe(Math.floor(Date.UTC(2026, 9, 11, 22, 47, 44) / 1000));
        expect(toEpochSeconds("2026-10-12 07:47:44+09:00")).toBe(Math.floor(Date.UTC(2026, 9, 11, 22, 47, 44) / 1000));
        expect(toEpochSeconds(new Date(Date.UTC(2026, 9, 11, 22, 47, 44, 900)))).toBe(Math.floor(Date.UTC(2026, 9, 11, 22, 47, 44) / 1000));
    });
    it("returns null for unreadable values", () => {
        expect(toEpochSeconds("not a date")).toBeNull();
        expect(toEpochSeconds({})).toBeNull();
    });
});

describe("Sprint phase view with PostgreSQL-shaped timestamps", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    let db: Database.Database, store: SprintGateStore, id: string;
    beforeEach(() => {
        db = new Database(":memory:");
        db.pragma("foreign_keys=ON");
        db.exec(`CREATE TABLE team_refs(id TEXT PRIMARY KEY);INSERT INTO team_refs VALUES('team');
 CREATE TABLE team_members(team_id TEXT,user_id TEXT,role TEXT);INSERT INTO team_members VALUES('team','leader','leader');
 CREATE TABLE tasks(id TEXT PRIMARY KEY,team_id TEXT,sprint_id TEXT,title TEXT,description TEXT,requirements TEXT,status TEXT,priority TEXT,assignee_id TEXT,project_id TEXT,deadline INTEGER,estimated_minutes INTEGER,category TEXT,executor_type TEXT NOT NULL DEFAULT 'human',updated_at INTEGER,lane TEXT DEFAULT 'backlog',created_at INTEGER,carried_from_sprint_id TEXT,completion_evidence TEXT);
 `);
        migratePlanning(db);
        id = new SprintStore(db).create("team", "leader", { name: "Sprint 1", goal: "goal", startsOn: "2026-10-12", endsOn: "2026-10-25", bufferEndsOn: "2026-10-27", cadenceDays: 14, capacityMinutes: null }, now).id;
        store = new SprintGateStore(sqliteGateDatabase(db));
    });
    afterEach(() => db.close());
    it("shows the planning phase when attached tasks carry timestamp text", async () => {
        db.prepare("INSERT INTO tasks(id,team_id,sprint_id,title,status,project_id,assignee_id,priority,deadline,updated_at) VALUES('a','team',?,'a','open','Lw','leader','medium','2026-10-25 14:59:59','2026-10-11 22:47:44.366')").run(id);
        const view = await store.view("team", id, now);
        expect(view.state.phase).toBe("planning");
        expect(view.tasks[0].updatedAt).toBe(Math.floor(Date.UTC(2026, 9, 11, 22, 47, 44) / 1000));
        expect(view.tasks[0].deadline).toBe(Math.floor(Date.UTC(2026, 9, 25, 14, 59, 59) / 1000));
    });
});
