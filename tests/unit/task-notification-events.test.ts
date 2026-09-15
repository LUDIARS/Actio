import { describe, expect, it } from "vitest";
import {
  deadlineSoonNotification,
  sprintNotification,
  taskChangeNotifications,
  type TaskSnapshot,
} from "../../modules/task/notifications/events.js";
import { buildDeliveryPayload, channelFor } from "../../modules/task/notifications/route.js";

const updatedAt = new Date("2026-09-15T00:00:00Z");

function snapshot(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task-1", title: "見積もり", teamId: "team-1", ownerId: "owner", assigneeId: "owner",
    status: "open", priority: "medium", executorType: "human", aiExecutor: null, deadline: null, updatedAt, ...overrides,
  };
}

describe("taskChangeNotifications", () => {
  it("emits assignment only when the assignee changes to someone other than the owner", () => {
    expect(taskChangeNotifications(null, snapshot())).toEqual([]);
    const intents = taskChangeNotifications(snapshot(), snapshot({ assigneeId: "member" }));
    expect(intents.map((i) => i.event)).toEqual(["task.assigned"]);
    expect(intents[0].recipientIds).toEqual(["member"]);
  });

  it("emits completion, priority raise and executor change with stable dedupe keys", () => {
    const before = snapshot({ assigneeId: "member" });
    const after = snapshot({ assigneeId: "member", status: "done", priority: "high", executorType: "ai", aiExecutor: "opus" });
    const intents = taskChangeNotifications(before, after);
    expect(intents.map((i) => i.event)).toEqual(["task.completed", "task.priority_raised", "task.executor_changed"]);
    expect(intents[0].recipientIds).toEqual(["owner", "member"]);
    expect(taskChangeNotifications(before, after).map((i) => i.dedupeKey)).toEqual(intents.map((i) => i.dedupeKey));
  });

  it("does not emit for a lowered priority", () => {
    expect(taskChangeNotifications(snapshot({ priority: "high" }), snapshot({ priority: "low" }))).toEqual([]);
  });
});

describe("deadlineSoonNotification", () => {
  const now = new Date("2026-09-15T09:00:00Z");
  it("fires inside the window once per deadline", () => {
    const task = snapshot({ deadline: new Date("2026-09-15T09:30:00Z") });
    const intent = deadlineSoonNotification(task, now, 60);
    expect(intent?.dedupeKey).toBe("task.deadline_soon:task-1:2026-09-15T09:30:00.000Z");
  });
  it("skips past, far and finished deadlines", () => {
    expect(deadlineSoonNotification(snapshot({ deadline: new Date("2026-09-15T08:00:00Z") }), now, 60)).toBeNull();
    expect(deadlineSoonNotification(snapshot({ deadline: new Date("2026-09-15T12:00:00Z") }), now, 60)).toBeNull();
    expect(deadlineSoonNotification(snapshot({ status: "done", deadline: new Date("2026-09-15T09:30:00Z") }), now, 60)).toBeNull();
  });
});

describe("delivery routing", () => {
  it("sends team work to a Cc task-kanban card and personal work to Memoria", () => {
    const team = taskChangeNotifications(snapshot(), snapshot({ assigneeId: "member" }))[0];
    expect(channelFor(team)).toBe("concordia");
    expect(buildDeliveryPayload(team, "concordia", "http://127.0.0.1:17881/")).toMatchObject({
      kind: "task-kanban",
      body: expect.stringMatching(/^http:\/\/127\.0\.0\.1:17881\/tasks\/planning\n\n/),
    });
    const personal = { ...team, teamId: null };
    expect(channelFor(personal)).toBe("memoria");
    expect(buildDeliveryPayload(personal, "memoria", "")).toMatchObject({ url: "/tasks", source: "actio", event: "task.assigned", task_id: "task-1" });
  });

  it("builds sprint notifications for the team", () => {
    const intent = sprintNotification("started", { id: "s1", teamId: "team-1", name: "W38", startsOn: "2026-09-14", endsOn: "2026-09-20" });
    expect(intent).toMatchObject({ event: "sprint.started", teamId: "team-1", dedupeKey: "sprint.started:s1" });
  });
});
