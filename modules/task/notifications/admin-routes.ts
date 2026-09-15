/**
 * 送信箱の状態確認 (admin)。 `GET /api/tasks/notifications?status=failed|pending|sent`
 * spec/feature/task-integration/spec.md §2.3
 */

import { Hono } from "hono";
import { taskNotificationRepo } from "../../../src/db/repository.js";
import { getUserRole } from "../../../src/middleware/getUserId.js";

const STATUSES = ["pending", "sent", "failed"] as const;
const LIST_LIMIT = 200;

export const notificationAdminRoutes = new Hono();

notificationAdminRoutes.get("/notifications", async (c) => {
  if (getUserRole(c) !== "admin") return c.json({ error: "Forbidden" }, 403);
  const status = c.req.query("status") ?? "failed";
  if (!(STATUSES as readonly string[]).includes(status)) return c.json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
  return c.json({ notifications: await taskNotificationRepo.listByStatus(status, LIST_LIMIT) });
});
