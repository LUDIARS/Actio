/**
 * Google Calendar 同期モジュール
 *
 * Schedula の personalEvents を Google Calendar に push/pull する。
 * 既存の calendar module は読み取り専用だが、このモジュールは書き込みも行う。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import {
  userRepo,
  personalEventRepo,
  integrationSettingRepo,
  syncLogRepo,
} from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";
import { secretManager } from "../../src/config/secrets.js";

const googleCalendarSync = new Hono();

// ─── Helper: period → ISO datetime 変換 ──────────────────────

function periodToDateTime(day: number, period: number, baseDate?: Date): { start: string; end: string } {
  const base = baseDate || getNextWeekday(day);
  const startHour = 9 + Math.floor((30 + period * 60) / 60);
  const startMin = (30 + period * 60) % 60;

  const start = new Date(base);
  start.setHours(startHour, startMin, 0, 0);
  const end = new Date(start);
  end.setHours(startHour + 1, startMin, 0, 0);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getNextWeekday(day: number): Date {
  // day: 0=月, 1=火, ..., 6=日
  // JS Date: 0=日, 1=月, ..., 6=土
  const jsDay = (day + 1) % 7;
  const now = new Date();
  const currentDay = now.getDay();
  const diff = (jsDay - currentDay + 7) % 7;
  const result = new Date(now);
  result.setDate(now.getDate() + (diff === 0 ? 7 : diff));
  return result;
}

// ─── Helper: Google Token リフレッシュ ────────────────────────

async function getValidGoogleToken(userId: string): Promise<string | null> {
  const user = await userRepo.findById(userId);
  if (!user?.googleRefreshToken) return null;

  // トークンがまだ有効なら再利用
  if (user.googleTokenExpiresAt && user.googleTokenExpiresAt > Date.now() + 60_000) {
    return user.googleAccessToken;
  }

  const GOOGLE_CLIENT_ID = secretManager.getOrDefault("GOOGLE_CLIENT_ID", "");
  const GOOGLE_CLIENT_SECRET = secretManager.getOrDefault("GOOGLE_CLIENT_SECRET", "");

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
      console.error("[gcal-sync] Token refresh failed:", await res.text());
      return null;
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    const tokenExpiresAt = Date.now() + data.expires_in * 1000;

    await userRepo.update(userId, {
      googleAccessToken: data.access_token,
      googleTokenExpiresAt: tokenExpiresAt,
      updatedAt: new Date(),
    });

    return data.access_token;
  } catch (err) {
    console.error("[gcal-sync] Token refresh error:", err);
    return null;
  }
}

// ─── Helper: Google Calendar書き込みスコープチェック ────────────

async function hasWriteScope(userId: string): Promise<boolean> {
  const user = await userRepo.findById(userId);
  const scopes: string[] = (user?.googleScopes as string[] | null) || [];
  return scopes.some(
    (s) => s.includes("calendar.events") && !s.includes("readonly")
  );
}

// ─── GET /status - Google Calendar同期ステータス ────────────

googleCalendarSync.get("/status", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const user = await userRepo.findById(userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const scopes: string[] = (user.googleScopes as string[] | null) || [];
  const canWrite = scopes.some(
    (s) => s.includes("calendar.events") && !s.includes("readonly")
  );

  const setting = await integrationSettingRepo.findByUserAndService(userId, "google_calendar");

  return c.json({
    connected: !!user.calendarAccessId,
    hasWriteScope: canWrite,
    syncEnabled: setting?.isActive || false,
    config: setting?.config || {},
  });
});

// ─── POST /enable - 同期有効化 (書き込みスコープが必要) ──────

googleCalendarSync.post("/enable", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const canWrite = await hasWriteScope(userId);
  if (!canWrite) {
    return c.json({
      error: "書き込み権限が不足しています。Google Calendar連携を再設定してください。",
      needsReauth: true,
    }, 403);
  }

  const body = await c.req.json<{
    calendarId?: string;
  }>().catch(() => ({} as { calendarId?: string }));

  await integrationSettingRepo.upsert({
    id: uuidv4(),
    userId,
    service: "google_calendar",
    isActive: true,
    config: { calendarId: body.calendarId || "primary" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "Google Calendar同期有効化", "Google Calendarへの同期が有効になりました");

  return c.json({ message: "Google Calendar sync enabled" });
});

// ─── POST /disable - 同期無効化 ─────────────────────────────

googleCalendarSync.post("/disable", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const setting = await integrationSettingRepo.findByUserAndService(userId, "google_calendar");
  if (setting) {
    await integrationSettingRepo.update(setting.id, { isActive: false });
  }

  return c.json({ message: "Google Calendar sync disabled" });
});

// ─── POST /push/:eventId - 個別イベントをGoogle Calendarに送信 ──

googleCalendarSync.post("/push/:eventId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("eventId");
  const event = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!event) return c.json({ error: "Event not found" }, 404);

  const accessToken = await getValidGoogleToken(userId);
  if (!accessToken) {
    return c.json({ error: "Google認証が必要です" }, 401);
  }

  const setting = await integrationSettingRepo.findByUserAndService(userId, "google_calendar");
  const calendarId = (setting?.config as Record<string, unknown>)?.calendarId || "primary";

  const { start, end } = periodToDateTime(event.day, event.period);

  const gcalEvent = {
    summary: event.title,
    description: event.description || `Schedula予定 (${event.eventType})`,
    start: { dateTime: start, timeZone: "Asia/Tokyo" },
    end: { dateTime: end, timeZone: "Asia/Tokyo" },
  };

  try {
    let gcalResponse: Response;
    let action: string;

    if (event.googleCalendarEventId) {
      // 既存イベントの更新
      gcalResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.googleCalendarEventId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(gcalEvent),
        }
      );
      action = "update";
    } else {
      // 新規イベント作成
      gcalResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(gcalEvent),
        }
      );
      action = "create";
    }

    if (!gcalResponse.ok) {
      const errBody = await gcalResponse.text();
      console.error("[gcal-sync] Push failed:", errBody);

      await syncLogRepo.create({
        id: uuidv4(),
        userId,
        service: "google_calendar",
        action: `sync_push_${action}`,
        localEventId: eventId,
        status: "error",
        errorMessage: errBody,
        createdAt: new Date(),
      });

      return c.json({ error: "Google Calendar APIエラー" }, 502);
    }

    const result = (await gcalResponse.json()) as { id: string };

    // ローカルイベントにGoogle Calendar IDを保存
    await personalEventRepo.update(eventId, {
      googleCalendarEventId: result.id,
      updatedAt: new Date(),
    });

    await syncLogRepo.create({
      id: uuidv4(),
      userId,
      service: "google_calendar",
      action: `sync_push_${action}`,
      localEventId: eventId,
      externalId: result.id,
      status: "success",
      createdAt: new Date(),
    });

    return c.json({
      message: action === "create" ? "Google Calendarに予定を作成しました" : "Google Calendarの予定を更新しました",
      googleCalendarEventId: result.id,
    });
  } catch (err) {
    console.error("[gcal-sync] Push error:", err);
    return c.json({ error: "同期エラー" }, 500);
  }
});

// ─── POST /push-all - 全予定をGoogle Calendarに一括同期 ──────

googleCalendarSync.post("/push-all", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const accessToken = await getValidGoogleToken(userId);
  if (!accessToken) {
    return c.json({ error: "Google認証が必要です" }, 401);
  }

  const canWrite = await hasWriteScope(userId);
  if (!canWrite) {
    return c.json({ error: "書き込み権限が不足しています" }, 403);
  }

  const events = await personalEventRepo.findByUserId(userId);
  const setting = await integrationSettingRepo.findByUserAndService(userId, "google_calendar");
  const calendarId = (setting?.config as Record<string, unknown>)?.calendarId || "primary";

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const event of events) {
    const { start, end } = periodToDateTime(event.day, event.period);
    const gcalEvent = {
      summary: event.title,
      description: event.description || `Schedula予定 (${event.eventType})`,
      start: { dateTime: start, timeZone: "Asia/Tokyo" },
      end: { dateTime: end, timeZone: "Asia/Tokyo" },
    };

    try {
      let res: Response;

      if (event.googleCalendarEventId) {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.googleCalendarEventId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(gcalEvent),
          }
        );
        if (res.ok) updated++;
        else errors++;
      } else {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(gcalEvent),
          }
        );
        if (res.ok) {
          const result = (await res.json()) as { id: string };
          await personalEventRepo.update(event.id, {
            googleCalendarEventId: result.id,
            updatedAt: new Date(),
          });
          created++;
        } else {
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }

  await syncLogRepo.create({
    id: uuidv4(),
    userId,
    service: "google_calendar",
    action: "sync_push_all",
    status: errors > 0 ? "error" : "success",
    errorMessage: errors > 0 ? `${errors} events failed` : undefined,
    createdAt: new Date(),
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "Google Calendar一括同期", `${created}件作成, ${updated}件更新, ${errors}件失敗`);

  return c.json({ created, updated, errors, total: events.length });
});

// ─── DELETE /push/:eventId - Google Calendarからイベントを削除 ──

googleCalendarSync.delete("/push/:eventId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("eventId");
  const event = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!event) return c.json({ error: "Event not found" }, 404);

  if (!event.googleCalendarEventId) {
    return c.json({ error: "この予定はGoogle Calendarに同期されていません" }, 400);
  }

  const accessToken = await getValidGoogleToken(userId);
  if (!accessToken) {
    return c.json({ error: "Google認証が必要です" }, 401);
  }

  const setting = await integrationSettingRepo.findByUserAndService(userId, "google_calendar");
  const calendarId = (setting?.config as Record<string, unknown>)?.calendarId || "primary";

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.googleCalendarEventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok && res.status !== 410) {
      return c.json({ error: "Google Calendar削除エラー" }, 502);
    }

    await personalEventRepo.update(eventId, {
      googleCalendarEventId: null,
      updatedAt: new Date(),
    });

    await syncLogRepo.create({
      id: uuidv4(),
      userId,
      service: "google_calendar",
      action: "sync_push_delete",
      localEventId: eventId,
      externalId: event.googleCalendarEventId,
      status: "success",
      createdAt: new Date(),
    });

    return c.json({ message: "Google Calendarから予定を削除しました" });
  } catch (err) {
    console.error("[gcal-sync] Delete error:", err);
    return c.json({ error: "削除エラー" }, 500);
  }
});

// ─── GET /logs - 同期ログ取得 ────────────────────────────────

googleCalendarSync.get("/logs", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const logs = await syncLogRepo.findByUserAndService(userId, "google_calendar");
  return c.json({ logs });
});

export { googleCalendarSync };
