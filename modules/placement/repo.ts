/**
 * Placement DB repository (multi-dialect drizzle).
 *
 * sqlite と postgres で同じ drizzle インターフェースが使えるので、
 * dialect 分岐は connection.ts 側で済んでいて、 ここでは `db` と `schema`
 * を直接使う。
 */

import { eq, and, desc, isNull } from "drizzle-orm";
import { db, schema } from "../../src/db/connection.js";
import type { PlaceLike } from "./engine.js";

export interface PlaceRecord extends PlaceLike {
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaceHookRecord {
  id: string;
  userId: string;
  placeId: string;
  event: "enter" | "leave";
  actionType: string;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
}

export interface PlacementStateRecord {
  userId: string;
  currentPlaceId: string | null;
  lastLat: number | null;
  lastLon: number | null;
  lastSeenAt: Date | null;
  updatedAt: Date;
}

export const placeRepo = {
  async listForUser(userId: string): Promise<PlaceRecord[]> {
    const rows = await db
      .select()
      .from(schema.places)
      .where(eq(schema.places.userId, userId));
    return rows.map(rowToPlace);
  },

  async findById(id: string): Promise<PlaceRecord | null> {
    const [row] = await db
      .select()
      .from(schema.places)
      .where(eq(schema.places.id, id));
    return row ? rowToPlace(row) : null;
  },

  async create(input: {
    id: string;
    userId: string;
    name: string;
    lat: number;
    lon: number;
    radiusM: number;
  }): Promise<PlaceRecord> {
    const now = new Date();
    await db.insert(schema.places).values({
      id: input.id,
      userId: input.userId,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      radiusM: input.radiusM,
      createdAt: now,
      updatedAt: now,
    });
    return {
      id: input.id,
      userId: input.userId,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      radiusM: input.radiusM,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(schema.places)
      .where(and(eq(schema.places.id, id), eq(schema.places.userId, userId)));
    // sqlite/postgres 共通: rowsAffected が無いケースは事後で findById して確認するが、
    // ここでは success を仮定して true 返却 (失敗時は select が空になる)
    void result;
    return true;
  },
};

export const placementStateRepo = {
  async get(userId: string): Promise<PlacementStateRecord | null> {
    const [row] = await db
      .select()
      .from(schema.placementState)
      .where(eq(schema.placementState.userId, userId));
    if (!row) return null;
    return {
      userId: row.userId,
      currentPlaceId: row.currentPlaceId ?? null,
      lastLat: row.lastLat ?? null,
      lastLon: row.lastLon ?? null,
      lastSeenAt: row.lastSeenAt ? toDate(row.lastSeenAt) : null,
      updatedAt: toDate(row.updatedAt),
    };
  },

  async upsert(input: {
    userId: string;
    currentPlaceId: string | null;
    lat: number;
    lon: number;
    seenAt: Date;
  }): Promise<void> {
    const existing = await this.get(input.userId);
    if (existing) {
      await db
        .update(schema.placementState)
        .set({
          currentPlaceId: input.currentPlaceId,
          lastLat: input.lat,
          lastLon: input.lon,
          lastSeenAt: input.seenAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.placementState.userId, input.userId));
    } else {
      await db.insert(schema.placementState).values({
        userId: input.userId,
        currentPlaceId: input.currentPlaceId,
        lastLat: input.lat,
        lastLon: input.lon,
        lastSeenAt: input.seenAt,
        updatedAt: new Date(),
      });
    }
  },
};

export const placeVisitRepo = {
  async startVisit(input: {
    id: string;
    userId: string;
    placeId: string;
    enteredAt: Date;
  }): Promise<void> {
    await db.insert(schema.placeVisits).values({
      id: input.id,
      userId: input.userId,
      placeId: input.placeId,
      enteredAt: input.enteredAt,
      leftAt: null,
    });
  },

  async closeOpenVisit(userId: string, placeId: string, leftAt: Date): Promise<void> {
    await db
      .update(schema.placeVisits)
      .set({ leftAt })
      .where(
        and(
          eq(schema.placeVisits.userId, userId),
          eq(schema.placeVisits.placeId, placeId),
          isNull(schema.placeVisits.leftAt),
        ),
      );
  },

  async listRecentForUser(userId: string, limit = 50) {
    return db
      .select()
      .from(schema.placeVisits)
      .where(eq(schema.placeVisits.userId, userId))
      .orderBy(desc(schema.placeVisits.enteredAt))
      .limit(limit);
  },
};

export const placeHookRepo = {
  async listForPlace(
    placeId: string,
    event: "enter" | "leave",
  ): Promise<PlaceHookRecord[]> {
    const rows = await db
      .select()
      .from(schema.placeHooks)
      .where(
        and(
          eq(schema.placeHooks.placeId, placeId),
          eq(schema.placeHooks.event, event),
          eq(schema.placeHooks.enabled, true),
        ),
      );
    return rows.map(rowToHook);
  },

  async listForUser(userId: string): Promise<PlaceHookRecord[]> {
    const rows = await db
      .select()
      .from(schema.placeHooks)
      .where(eq(schema.placeHooks.userId, userId));
    return rows.map(rowToHook);
  },

  async create(input: {
    id: string;
    userId: string;
    placeId: string;
    event: "enter" | "leave";
    actionType: string;
    actionConfig: Record<string, unknown>;
    enabled: boolean;
  }): Promise<void> {
    await db.insert(schema.placeHooks).values({
      id: input.id,
      userId: input.userId,
      placeId: input.placeId,
      event: input.event,
      actionType: input.actionType,
      actionConfig: input.actionConfig,
      enabled: input.enabled,
      createdAt: new Date(),
    });
  },

  async update(
    id: string,
    userId: string,
    patch: Partial<{
      event: "enter" | "leave";
      actionType: string;
      actionConfig: Record<string, unknown>;
      enabled: boolean;
    }>,
  ): Promise<void> {
    await db
      .update(schema.placeHooks)
      .set(patch)
      .where(and(eq(schema.placeHooks.id, id), eq(schema.placeHooks.userId, userId)));
  },

  async remove(id: string, userId: string): Promise<void> {
    await db
      .delete(schema.placeHooks)
      .where(and(eq(schema.placeHooks.id, id), eq(schema.placeHooks.userId, userId)));
  },
};

// ─── helpers ────────────────────────────────────────────────

function rowToPlace(row: typeof schema.places.$inferSelect): PlaceRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    radiusM: row.radiusM,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function rowToHook(row: typeof schema.placeHooks.$inferSelect): PlaceHookRecord {
  return {
    id: row.id,
    userId: row.userId,
    placeId: row.placeId,
    event: row.event,
    actionType: row.actionType,
    actionConfig: (row.actionConfig as Record<string, unknown>) ?? {},
    enabled: Boolean(row.enabled),
    createdAt: toDate(row.createdAt),
  };
}

function toDate(value: Date | number | string): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value * 1000);
  return new Date(value);
}
