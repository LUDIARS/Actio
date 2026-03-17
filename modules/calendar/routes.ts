import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";

const calendar = new Hono();

// ─── Helper: Google Tokenリフレッシュ ────────────────────────

async function refreshGoogleToken(userId: string): Promise<string | null> {
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user?.googleRefreshToken) return null;

  // トークンがまだ有効なら再利用
  if (user.googleTokenExpiresAt && user.googleTokenExpiresAt > Date.now() + 60_000) {
    return user.googleAccessToken;
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: user.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("[calendar] Google token refresh failed:", await res.text());
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    const tokenExpiresAt = Date.now() + data.expires_in * 1000;

    db.update(schema.users)
      .set({
        googleAccessToken: data.access_token,
        googleTokenExpiresAt: tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .run();

    return data.access_token;
  } catch (err) {
    console.error("[calendar] Google token refresh error:", err);
    return null;
  }
}

// ─── GET /events - Google Calendarイベント取得 ──────────────

calendar.get("/events", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user.googleId) {
    return c.json({ error: "Google Calendar not connected", connected: false }, 400);
  }

  const accessToken = await refreshGoogleToken(userId);
  if (!accessToken) {
    return c.json({ error: "Failed to refresh Google token. Please re-authenticate." }, 401);
  }

  // クエリパラメータ
  const timeMin = c.req.query("timeMin") || new Date().toISOString();
  const timeMax = c.req.query("timeMax") || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxResults = c.req.query("maxResults") || "50";

  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults,
      singleEvents: "true",
      orderBy: "startTime",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[calendar] Google Calendar API error:", errBody);
      return c.json({ error: "Failed to fetch calendar events" }, 502);
    }

    const data = (await res.json()) as {
      items: Array<{
        id: string;
        summary?: string;
        description?: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
        status: string;
      }>;
    };

    const events = (data.items || []).map((item) => ({
      id: item.id,
      title: item.summary || "(無題)",
      description: item.description || "",
      start: item.start.dateTime || item.start.date || "",
      end: item.end.dateTime || item.end.date || "",
      status: item.status,
      source: "google",
    }));

    return c.json({ events, connected: true });
  } catch (err) {
    console.error("[calendar] Failed to fetch events:", err);
    return c.json({ error: "Failed to fetch calendar events" }, 500);
  }
});

// ─── GET /calendars - Google Calendarリスト取得 ─────────────

calendar.get("/calendars", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const accessToken = await refreshGoogleToken(userId);
  if (!accessToken) {
    return c.json({ error: "Google Calendar not connected" }, 400);
  }

  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      return c.json({ error: "Failed to fetch calendar list" }, 502);
    }

    const data = (await res.json()) as {
      items: Array<{
        id: string;
        summary: string;
        primary?: boolean;
        backgroundColor?: string;
      }>;
    };

    return c.json({
      calendars: (data.items || []).map((cal) => ({
        id: cal.id,
        name: cal.summary,
        primary: cal.primary || false,
        color: cal.backgroundColor,
      })),
    });
  } catch (err) {
    console.error("[calendar] Failed to fetch calendar list:", err);
    return c.json({ error: "Internal error" }, 500);
  }
});

// ─── GET /status - Google Calendar接続状態 ──────────────────

calendar.get("/status", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) return c.json({ error: "User not found" }, 404);

  return c.json({
    connected: !!user.googleId,
    email: user.email,
    hasGoogleAuth: !!user.googleId,
  });
});

// ─── POST /disconnect - Google Calendar連携解除 ─────────────

calendar.post("/disconnect", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) return c.json({ error: "User not found" }, 404);

  // パスワードが設定されてない場合は切断不可(ログイン手段がなくなる)
  if (!user.passwordHash) {
    return c.json({
      error: "パスワードを設定してからGoogle連携を解除してください",
    }, 400);
  }

  db.update(schema.users)
    .set({
      googleId: null,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
      calendarAccessId: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ message: "Google Calendar disconnected" });
});

// ═══════════════════════════════════════════════════════════════
// Personal Events (手動予定) CRUD
// ═══════════════════════════════════════════════════════════════

// ─── GET /personal - 手動予定一覧 ──────────────────────────

calendar.get("/personal", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const events = db
    .select()
    .from(schema.personalEvents)
    .where(eq(schema.personalEvents.userId, userId))
    .all();

  return c.json({ events });
});

// ─── POST /personal - 手動予定追加 ─────────────────────────

calendar.post("/personal", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    title: string;
    description?: string;
    day: number;
    period: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }>();

  if (!body.title || body.day == null || body.period == null) {
    return c.json({ error: "title, day, period are required" }, 400);
  }

  if (body.day < 0 || body.day > 6) {
    return c.json({ error: "day must be 0-6" }, 400);
  }
  if (body.period < 0 || body.period > 10) {
    return c.json({ error: "period must be 0-10" }, 400);
  }

  // 重複チェック
  const existing = db
    .select()
    .from(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.userId, userId),
        eq(schema.personalEvents.day, body.day),
        eq(schema.personalEvents.period, body.period)
      )
    )
    .get();

  if (existing) {
    return c.json({ error: "このスロットには既に予定があります" }, 409);
  }

  const id = uuidv4();
  const now = new Date();

  db.insert(schema.personalEvents)
    .values({
      id,
      userId,
      title: body.title,
      description: body.description || null,
      day: body.day,
      period: body.period,
      duration: body.duration || 1,
      eventType: body.eventType || "personal",
      isPrivate: body.isPrivate !== false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = db
    .select()
    .from(schema.personalEvents)
    .where(eq(schema.personalEvents.id, id))
    .get();

  return c.json({ event: created }, 201);
});

// ─── PUT /personal/:id - 手動予定更新 ─────────────────────

calendar.put("/personal/:id", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("id");
  const existing = db
    .select()
    .from(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.id, eventId),
        eq(schema.personalEvents.userId, userId)
      )
    )
    .get();

  if (!existing) {
    return c.json({ error: "Event not found" }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    description?: string;
    day?: number;
    period?: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.day !== undefined) updates.day = body.day;
  if (body.period !== undefined) updates.period = body.period;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined) updates.eventType = body.eventType;
  if (body.isPrivate !== undefined) updates.isPrivate = body.isPrivate;

  db.update(schema.personalEvents)
    .set(updates)
    .where(eq(schema.personalEvents.id, eventId))
    .run();

  const updated = db
    .select()
    .from(schema.personalEvents)
    .where(eq(schema.personalEvents.id, eventId))
    .get();

  return c.json({ event: updated });
});

// ─── DELETE /personal/:id - 手動予定削除 ───────────────────

calendar.delete("/personal/:id", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("id");
  const existing = db
    .select()
    .from(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.id, eventId),
        eq(schema.personalEvents.userId, userId)
      )
    )
    .get();

  if (!existing) {
    return c.json({ error: "Event not found" }, 404);
  }

  db.delete(schema.personalEvents)
    .where(eq(schema.personalEvents.id, eventId))
    .run();

  return c.json({ message: "Event deleted" });
});

// ═══════════════════════════════════════════════════════════════
// Plans (プラン: 繰り返し予定の自動生成)
// ═══════════════════════════════════════════════════════════════

// ─── Helper: プランからイベントを自動生成 ─────────────────────

function generateEventsFromPlan(
  planId: string,
  userId: string,
  plan: {
    name: string;
    days: number[];
    startPeriod: number;
    duration: number;
    eventType: string;
    isPrivate: boolean;
  }
) {
  // まず既存のプラン由来イベントを削除
  db.delete(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.userId, userId),
        eq(schema.personalEvents.planId, planId)
      )
    )
    .run();

  const now = new Date();
  let created = 0;

  for (const day of plan.days) {
    for (let p = 0; p < plan.duration; p++) {
      const period = plan.startPeriod + p;
      if (period > 10) continue;

      // 既存予定との重複チェック (他のソースの予定)
      const conflict = db
        .select()
        .from(schema.personalEvents)
        .where(
          and(
            eq(schema.personalEvents.userId, userId),
            eq(schema.personalEvents.day, day),
            eq(schema.personalEvents.period, period)
          )
        )
        .get();

      if (conflict) continue;

      db.insert(schema.personalEvents)
        .values({
          id: uuidv4(),
          userId,
          title: plan.name,
          day,
          period,
          duration: 1,
          eventType: plan.eventType,
          planId,
          isPrivate: plan.isPrivate,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      created++;
    }
  }

  return created;
}

// ─── GET /plans - プラン一覧 ──────────────────────────────

calendar.get("/plans", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planList = db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.userId, userId))
    .all();

  return c.json({ plans: planList });
});

// ─── POST /plans - プラン作成 + イベント自動生成 ────────────

calendar.post("/plans", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    name: string;
    description?: string;
    days: number[];
    startPeriod: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
  }>();

  if (!body.name || !body.days?.length || body.startPeriod == null) {
    return c.json({ error: "name, days, startPeriod are required" }, 400);
  }

  // バリデーション
  for (const d of body.days) {
    if (d < 0 || d > 6) return c.json({ error: "days must contain values 0-6" }, 400);
  }
  if (body.startPeriod < 0 || body.startPeriod > 10) {
    return c.json({ error: "startPeriod must be 0-10" }, 400);
  }

  const planId = uuidv4();
  const now = new Date();
  const duration = body.duration || 1;
  const eventType = body.eventType || "personal";
  const isPrivate = body.isPrivate !== false;

  db.insert(schema.plans)
    .values({
      id: planId,
      userId,
      name: body.name,
      description: body.description || null,
      days: body.days,
      startPeriod: body.startPeriod,
      duration,
      eventType,
      isPrivate,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // イベント自動生成
  const createdCount = generateEventsFromPlan(planId, userId, {
    name: body.name,
    days: body.days,
    startPeriod: body.startPeriod,
    duration,
    eventType,
    isPrivate,
  });

  const plan = db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .get();

  return c.json({ plan, generatedEvents: createdCount }, 201);
});

// ─── PUT /plans/:id - プラン更新 + イベント再生成 ──────────

calendar.put("/plans/:id", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = db
    .select()
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.id, planId),
        eq(schema.plans.userId, userId)
      )
    )
    .get();

  if (!existing) return c.json({ error: "Plan not found" }, 404);

  const body = await c.req.json<{
    name?: string;
    description?: string;
    days?: number[];
    startPeriod?: number;
    duration?: number;
    eventType?: string;
    isPrivate?: boolean;
    isActive?: boolean;
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.days !== undefined) updates.days = body.days;
  if (body.startPeriod !== undefined) updates.startPeriod = body.startPeriod;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.eventType !== undefined) updates.eventType = body.eventType;
  if (body.isPrivate !== undefined) updates.isPrivate = body.isPrivate;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  db.update(schema.plans)
    .set(updates)
    .where(eq(schema.plans.id, planId))
    .run();

  const updated = db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .get();

  // プランが有効なら再生成
  let generatedEvents = 0;
  if (updated.isActive) {
    generatedEvents = generateEventsFromPlan(planId, userId, {
      name: updated.name,
      days: updated.days as number[],
      startPeriod: updated.startPeriod,
      duration: updated.duration,
      eventType: updated.eventType,
      isPrivate: updated.isPrivate,
    });
  } else {
    // 無効化された場合はプラン由来のイベントを削除
    db.delete(schema.personalEvents)
      .where(
        and(
          eq(schema.personalEvents.userId, userId),
          eq(schema.personalEvents.planId, planId)
        )
      )
      .run();
  }

  return c.json({ plan: updated, generatedEvents });
});

// ─── DELETE /plans/:id - プラン削除 + 関連イベント削除 ─────

calendar.delete("/plans/:id", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const existing = db
    .select()
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.id, planId),
        eq(schema.plans.userId, userId)
      )
    )
    .get();

  if (!existing) return c.json({ error: "Plan not found" }, 404);

  // プラン由来のイベントを削除
  db.delete(schema.personalEvents)
    .where(
      and(
        eq(schema.personalEvents.userId, userId),
        eq(schema.personalEvents.planId, planId)
      )
    )
    .run();

  // プラン本体を削除
  db.delete(schema.plans)
    .where(eq(schema.plans.id, planId))
    .run();

  return c.json({ message: "Plan and associated events deleted" });
});

// ─── POST /plans/:id/regenerate - プランからイベント再生成 ──

calendar.post("/plans/:id/regenerate", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const planId = c.req.param("id");
  const plan = db
    .select()
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.id, planId),
        eq(schema.plans.userId, userId)
      )
    )
    .get();

  if (!plan) return c.json({ error: "Plan not found" }, 404);

  if (!plan.isActive) {
    return c.json({ error: "Plan is not active" }, 400);
  }

  const createdCount = generateEventsFromPlan(planId, userId, {
    name: plan.name,
    days: plan.days as number[],
    startPeriod: plan.startPeriod,
    duration: plan.duration,
    eventType: plan.eventType,
    isPrivate: plan.isPrivate,
  });

  return c.json({ generatedEvents: createdCount });
});

// ─── GET /conflicts - バッティング検出 ───────────────────────
// 個人の予定とグループの予定の重複を検出

calendar.get("/conflicts", (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  // 個人の予定を取得
  const personalEvts = db
    .select()
    .from(schema.personalEvents)
    .where(eq(schema.personalEvents.userId, userId))
    .all();

  // ユーザーが所属するグループの予定を取得
  const memberships = db
    .select()
    .from(schema.groupMembers)
    .where(eq(schema.groupMembers.userId, userId))
    .all();

  const groupScheduleList: Array<{
    id: string;
    groupId: string;
    groupName: string;
    title: string;
    day: number;
    period: number;
    duration: number;
  }> = [];

  for (const m of memberships) {
    const group = db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, m.groupId))
      .get();

    if (!group) continue;

    const schedules = db
      .select()
      .from(schema.groupSchedules)
      .where(eq(schema.groupSchedules.groupId, m.groupId))
      .all();

    for (const s of schedules) {
      groupScheduleList.push({
        id: s.id,
        groupId: m.groupId,
        groupName: group.name,
        title: s.title,
        day: s.day,
        period: s.period,
        duration: s.duration,
      });
    }
  }

  // バッティング検出
  const conflicts: Array<{
    day: number;
    period: number;
    items: Array<{ type: string; title: string; source: string }>;
  }> = [];

  // slot → items のマップ
  const slotMap = new Map<string, Array<{ type: string; title: string; source: string }>>();

  for (const evt of personalEvts) {
    const key = `${evt.day}-${evt.period}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key)!.push({
      type: "personal",
      title: evt.title,
      source: evt.planId ? "マイプラン" : "手動",
    });
  }

  for (const gs of groupScheduleList) {
    for (let p = 0; p < gs.duration; p++) {
      const period = gs.period + p;
      if (period > 10) continue;
      const key = `${gs.day}-${period}`;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key)!.push({
        type: "group",
        title: gs.title,
        source: gs.groupName,
      });
    }
  }

  // 2つ以上のアイテムがあるスロットがバッティング
  for (const [key, items] of slotMap.entries()) {
    if (items.length >= 2) {
      const [day, period] = key.split("-").map(Number);
      conflicts.push({ day, period, items });
    }
  }

  return c.json({ conflicts });
});

export { calendar };
