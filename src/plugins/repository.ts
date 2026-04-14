/**
 * Module Installations / States リポジトリ
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/connection.js";

export type ModuleInstallation = typeof schema.moduleInstallations.$inferSelect;
export type NewModuleInstallation = typeof schema.moduleInstallations.$inferInsert;
export type ModuleState = typeof schema.moduleStates.$inferSelect;

export type ScopeType = "global" | "group" | "user";

export const moduleInstallationRepo = {
  async findAll(): Promise<ModuleInstallation[]> {
    return db.select().from(schema.moduleInstallations);
  },

  async findById(moduleId: string): Promise<ModuleInstallation | undefined> {
    const [row] = await db
      .select()
      .from(schema.moduleInstallations)
      .where(eq(schema.moduleInstallations.moduleId, moduleId));
    return row;
  },

  async upsert(data: NewModuleInstallation): Promise<void> {
    const existing = await this.findById(data.moduleId);
    if (existing) {
      await db
        .update(schema.moduleInstallations)
        .set({
          packageName: data.packageName,
          packageVersion: data.packageVersion,
          manifest: data.manifest,
        })
        .where(eq(schema.moduleInstallations.moduleId, data.moduleId));
    } else {
      await db.insert(schema.moduleInstallations).values(data);
    }
  },

  async deleteByModuleId(moduleId: string): Promise<void> {
    await db
      .delete(schema.moduleInstallations)
      .where(eq(schema.moduleInstallations.moduleId, moduleId));
  },
};

export const moduleStateRepo = {
  async findByScope(
    moduleId: string,
    scopeType: ScopeType,
    scopeId: string | null = null,
  ): Promise<ModuleState | undefined> {
    const conditions = [
      eq(schema.moduleStates.moduleId, moduleId),
      eq(schema.moduleStates.scopeType, scopeType),
    ];
    if (scopeId !== null) {
      conditions.push(eq(schema.moduleStates.scopeId, scopeId));
    }
    const [row] = await db
      .select()
      .from(schema.moduleStates)
      .where(and(...conditions));
    return row;
  },

  async setEnabled(
    id: string,
    moduleId: string,
    scopeType: ScopeType,
    scopeId: string | null,
    enabled: boolean,
    changedBy?: string,
  ): Promise<void> {
    const existing = await this.findByScope(moduleId, scopeType, scopeId);
    if (existing) {
      await db
        .update(schema.moduleStates)
        .set({ enabled, changedAt: new Date(), changedBy: changedBy ?? null })
        .where(eq(schema.moduleStates.id, existing.id));
    } else {
      await db.insert(schema.moduleStates).values({
        id,
        moduleId,
        scopeType,
        scopeId,
        enabled,
        changedAt: new Date(),
        changedBy: changedBy ?? null,
      });
    }
  },

  async findAllForModule(moduleId: string): Promise<ModuleState[]> {
    return db
      .select()
      .from(schema.moduleStates)
      .where(eq(schema.moduleStates.moduleId, moduleId));
  },
};
