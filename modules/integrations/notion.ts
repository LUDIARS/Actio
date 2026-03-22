/**
 * Notion 連携モジュール
 *
 * Notion API を使ったデータベースの CRUD と
 * Schedula personalEvents ↔ Notion DB の同期を行う。
 *
 * Notion Integration Token はユーザーが手動で設定する。
 * (Notion OAuth public integration は別途対応可能)
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

const notion = new Hono();

const NOTION_API_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

// ─── Helper: Notion API リクエスト ──────────────────────────

async function notionFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${NOTION_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

// ─── Helper: Notion設定取得 ──────────────────────────────────

async function getNotionConfig(userId: string) {
  const setting = await integrationSettingRepo.findByUserAndService(userId, "notion");
  if (!setting || !setting.accessToken) return null;
  return {
    token: setting.accessToken,
    databaseId: (setting.config as Record<string, unknown>)?.databaseId as string | undefined,
    setting,
  };
}

// ─── POST /connect - Notion連携設定 ──────────────────────────
// ユーザーがNotion Integration Tokenを設定する

notion.post("/connect", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    token: string;
    databaseId?: string;
  }>();

  if (!body.token) {
    return c.json({ error: "Notion Integration Token is required" }, 400);
  }

  // トークンの有効性を確認
  try {
    const res = await notionFetch("/users/me", body.token);
    if (!res.ok) {
      return c.json({ error: "無効なNotionトークンです" }, 400);
    }
    const me = (await res.json()) as { type: string; bot?: { owner?: { type: string } } };

    await integrationSettingRepo.upsert({
      id: uuidv4(),
      userId,
      service: "notion",
      accessToken: body.token,
      isActive: true,
      config: {
        databaseId: body.databaseId || null,
        botType: me.type,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await userRepo.findById(userId);
    logActivity(userId, user?.name || "Unknown", "Notion連携設定", "Notionとの連携が設定されました");

    return c.json({ message: "Notion connected successfully" });
  } catch (err) {
    console.error("[notion] Connect error:", err);
    return c.json({ error: "Notion接続エラー" }, 500);
  }
});

// ─── POST /disconnect - Notion連携解除 ──────────────────────

notion.post("/disconnect", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const setting = await integrationSettingRepo.findByUserAndService(userId, "notion");
  if (setting) {
    await integrationSettingRepo.deleteById(setting.id);
  }

  return c.json({ message: "Notion disconnected" });
});

// ─── GET /status - Notion連携ステータス ─────────────────────

notion.get("/status", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);

  return c.json({
    connected: !!config,
    databaseId: config?.databaseId || null,
    isActive: config?.setting.isActive || false,
  });
});

// ─── GET /databases - Notion DBリスト取得 ────────────────────

notion.get("/databases", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config) return c.json({ error: "Notion未連携" }, 400);

  try {
    const res = await notionFetch("/search", config.token, {
      method: "POST",
      body: JSON.stringify({
        filter: { value: "database", property: "object" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[notion] Search databases error:", errBody);
      return c.json({ error: "Notion APIエラー" }, 502);
    }

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        title: Array<{ plain_text: string }>;
        properties: Record<string, unknown>;
      }>;
    };

    const databases = data.results.map((db) => ({
      id: db.id,
      title: db.title.map((t) => t.plain_text).join("") || "(無題)",
      properties: Object.keys(db.properties),
    }));

    return c.json({ databases });
  } catch (err) {
    console.error("[notion] List databases error:", err);
    return c.json({ error: "Notion APIエラー" }, 500);
  }
});

// ─── PUT /database - 同期先DBを設定 ──────────────────────────

notion.put("/database", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{ databaseId: string }>();
  if (!body.databaseId) {
    return c.json({ error: "databaseId is required" }, 400);
  }

  const config = await getNotionConfig(userId);
  if (!config) return c.json({ error: "Notion未連携" }, 400);

  // DB存在確認
  const res = await notionFetch(`/databases/${body.databaseId}`, config.token);
  if (!res.ok) {
    return c.json({ error: "指定されたNotionデータベースが見つかりません" }, 404);
  }

  await integrationSettingRepo.update(config.setting.id, {
    config: { ...config.setting.config as Record<string, unknown>, databaseId: body.databaseId },
  });

  return c.json({ message: "同期先データベースを設定しました", databaseId: body.databaseId });
});

// ─── POST /database/create - Schedula用Notion DBを自動作成 ──

notion.post("/database/create", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config) return c.json({ error: "Notion未連携" }, 400);

  const body = await c.req.json<{ parentPageId: string }>().catch(() => ({ parentPageId: "" }));

  if (!body.parentPageId) {
    return c.json({ error: "parentPageId (作成先のNotionページID) が必要です" }, 400);
  }

  try {
    const res = await notionFetch("/databases", config.token, {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "page_id", page_id: body.parentPageId },
        title: [{ type: "text", text: { content: "Schedula 予定" } }],
        properties: {
          タイトル: { title: {} },
          曜日: {
            select: {
              options: [
                { name: "月", color: "red" },
                { name: "火", color: "orange" },
                { name: "水", color: "yellow" },
                { name: "木", color: "green" },
                { name: "金", color: "blue" },
                { name: "土", color: "purple" },
                { name: "日", color: "pink" },
              ],
            },
          },
          時限: { number: {} },
          開始時間: { rich_text: {} },
          終了時間: { rich_text: {} },
          種別: {
            select: {
              options: [
                { name: "personal", color: "blue" },
                { name: "school_event", color: "green" },
              ],
            },
          },
          説明: { rich_text: {} },
          "Schedula ID": { rich_text: {} },
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[notion] Create database error:", errBody);
      return c.json({ error: "Notion DB作成エラー" }, 502);
    }

    const data = (await res.json()) as { id: string };

    // 設定に保存
    await integrationSettingRepo.update(config.setting.id, {
      config: { ...config.setting.config as Record<string, unknown>, databaseId: data.id },
    });

    const user = await userRepo.findById(userId);
    logActivity(userId, user?.name || "Unknown", "Notion DB作成", "Schedula連携用Notionデータベースを作成しました");

    return c.json({ message: "Notion DBを作成しました", databaseId: data.id });
  } catch (err) {
    console.error("[notion] Create database error:", err);
    return c.json({ error: "Notion DB作成エラー" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// Notion DB CRUD (汎用)
// ═══════════════════════════════════════════════════════════════

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// ─── GET /pages - Notion DBのページ一覧取得 ─────────────────

notion.get("/pages", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config?.databaseId) return c.json({ error: "Notion DBが未設定です" }, 400);

  try {
    const res = await notionFetch(`/databases/${config.databaseId}/query`, config.token, {
      method: "POST",
      body: JSON.stringify({ page_size: 100 }),
    });

    if (!res.ok) {
      return c.json({ error: "Notion APIエラー" }, 502);
    }

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        properties: Record<string, any>;
        created_time: string;
        last_edited_time: string;
      }>;
    };

    const pages = data.results.map((page) => ({
      id: page.id,
      properties: page.properties,
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time,
    }));

    return c.json({ pages });
  } catch (err) {
    console.error("[notion] Query pages error:", err);
    return c.json({ error: "Notion APIエラー" }, 500);
  }
});

// ─── POST /pages - Notion DBにページを作成 ──────────────────

notion.post("/pages", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config?.databaseId) return c.json({ error: "Notion DBが未設定です" }, 400);

  const body = await c.req.json<{
    properties: Record<string, unknown>;
  }>();

  try {
    const res = await notionFetch("/pages", config.token, {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: config.databaseId },
        properties: body.properties,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[notion] Create page error:", errBody);
      return c.json({ error: "Notion ページ作成エラー" }, 502);
    }

    const data = (await res.json()) as { id: string };
    return c.json({ message: "ページを作成しました", pageId: data.id }, 201);
  } catch (err) {
    console.error("[notion] Create page error:", err);
    return c.json({ error: "Notion APIエラー" }, 500);
  }
});

// ─── PUT /pages/:pageId - Notion ページを更新 ───────────────

notion.put("/pages/:pageId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config) return c.json({ error: "Notion未連携" }, 400);

  const pageId = c.req.param("pageId");
  const body = await c.req.json<{
    properties: Record<string, unknown>;
  }>();

  try {
    const res = await notionFetch(`/pages/${pageId}`, config.token, {
      method: "PATCH",
      body: JSON.stringify({ properties: body.properties }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[notion] Update page error:", errBody);
      return c.json({ error: "Notion ページ更新エラー" }, 502);
    }

    return c.json({ message: "ページを更新しました" });
  } catch (err) {
    console.error("[notion] Update page error:", err);
    return c.json({ error: "Notion APIエラー" }, 500);
  }
});

// ─── DELETE /pages/:pageId - Notion ページをアーカイブ ───────

notion.delete("/pages/:pageId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config) return c.json({ error: "Notion未連携" }, 400);

  const pageId = c.req.param("pageId");

  try {
    const res = await notionFetch(`/pages/${pageId}`, config.token, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });

    if (!res.ok) {
      return c.json({ error: "Notion ページ削除エラー" }, 502);
    }

    return c.json({ message: "ページをアーカイブしました" });
  } catch (err) {
    console.error("[notion] Archive page error:", err);
    return c.json({ error: "Notion APIエラー" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// Schedula → Notion 同期
// ═══════════════════════════════════════════════════════════════

// ─── POST /sync/push/:eventId - 個別イベントをNotionに同期 ──

notion.post("/sync/push/:eventId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const eventId = c.req.param("eventId");
  const event = await personalEventRepo.findByIdAndUserId(eventId, userId);
  if (!event) return c.json({ error: "Event not found" }, 404);

  const config = await getNotionConfig(userId);
  if (!config?.databaseId) return c.json({ error: "Notion DBが未設定です" }, 400);

  const properties: Record<string, unknown> = {
    タイトル: { title: [{ text: { content: event.title } }] },
    曜日: { select: { name: DAY_LABELS[event.day] || "月" } },
    時限: { number: event.period },
    開始時間: { rich_text: [{ text: { content: event.startTime || "" } }] },
    終了時間: { rich_text: [{ text: { content: event.endTime || "" } }] },
    種別: { select: { name: event.eventType } },
    説明: { rich_text: [{ text: { content: event.description || "" } }] },
    "Schedula ID": { rich_text: [{ text: { content: event.id } }] },
  };

  try {
    let res: Response;
    let action: string;

    if (event.notionPageId) {
      // 既存ページの更新
      res = await notionFetch(`/pages/${event.notionPageId}`, config.token, {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      });
      action = "update";
    } else {
      // 新規ページ作成
      res = await notionFetch("/pages", config.token, {
        method: "POST",
        body: JSON.stringify({
          parent: { database_id: config.databaseId },
          properties,
        }),
      });
      action = "create";
    }

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[notion] Sync push error:", errBody);

      await syncLogRepo.create({
        id: uuidv4(),
        userId,
        service: "notion",
        action: `sync_push_${action}`,
        localEventId: eventId,
        status: "error",
        errorMessage: errBody,
        createdAt: new Date(),
      });

      return c.json({ error: "Notion同期エラー" }, 502);
    }

    const data = (await res.json()) as { id: string };

    if (action === "create") {
      await personalEventRepo.update(eventId, {
        notionPageId: data.id,
        updatedAt: new Date(),
      });
    }

    await syncLogRepo.create({
      id: uuidv4(),
      userId,
      service: "notion",
      action: `sync_push_${action}`,
      localEventId: eventId,
      externalId: data.id,
      status: "success",
      createdAt: new Date(),
    });

    return c.json({
      message: action === "create" ? "Notionにページを作成しました" : "Notionのページを更新しました",
      notionPageId: data.id,
    });
  } catch (err) {
    console.error("[notion] Sync push error:", err);
    return c.json({ error: "同期エラー" }, 500);
  }
});

// ─── POST /sync/push-all - 全予定をNotionに一括同期 ─────────

notion.post("/sync/push-all", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const config = await getNotionConfig(userId);
  if (!config?.databaseId) return c.json({ error: "Notion DBが未設定です" }, 400);

  const events = await personalEventRepo.findByUserId(userId);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const event of events) {
    const properties: Record<string, unknown> = {
      タイトル: { title: [{ text: { content: event.title } }] },
      曜日: { select: { name: DAY_LABELS[event.day] || "月" } },
      時限: { number: event.period },
      開始時間: { rich_text: [{ text: { content: event.startTime || "" } }] },
      終了時間: { rich_text: [{ text: { content: event.endTime || "" } }] },
      種別: { select: { name: event.eventType } },
      説明: { rich_text: [{ text: { content: event.description || "" } }] },
      "Schedula ID": { rich_text: [{ text: { content: event.id } }] },
    };

    try {
      let res: Response;

      if (event.notionPageId) {
        res = await notionFetch(`/pages/${event.notionPageId}`, config.token, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        });
        if (res.ok) updated++;
        else errors++;
      } else {
        res = await notionFetch("/pages", config.token, {
          method: "POST",
          body: JSON.stringify({
            parent: { database_id: config.databaseId },
            properties,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { id: string };
          await personalEventRepo.update(event.id, {
            notionPageId: data.id,
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
    service: "notion",
    action: "sync_push_all",
    status: errors > 0 ? "error" : "success",
    errorMessage: errors > 0 ? `${errors} events failed` : undefined,
    createdAt: new Date(),
  });

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "Notion一括同期", `${created}件作成, ${updated}件更新, ${errors}件失敗`);

  return c.json({ created, updated, errors, total: events.length });
});

// ─── GET /sync/logs - 同期ログ取得 ──────────────────────────

notion.get("/sync/logs", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const logs = await syncLogRepo.findByUserAndService(userId, "notion");
  return c.json({ logs });
});

export { notion };
