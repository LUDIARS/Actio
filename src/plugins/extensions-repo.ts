/**
 * Repository for the Issue #111 plugin extension tables
 * (issue_links / comments / custom_field_values / workflow_transitions).
 *
 * いずれも共通の `target_type` + `target_id` で event / task 両方を
 * 扱えるよう汎化した設計。
 */

import { and, desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db, schema } from "../db/connection.js";

export type TargetType = "event" | "task";

// ─── Issue Links (D3) ────────────────────────────────────────

export const issueLinkRepo = {
  async create(input: {
    fromType: TargetType; fromId: string;
    toType:   TargetType; toId:   string;
    linkType: string;
    createdBy: string;
  }) {
    const id = uuidv4();
    await db.insert(schema.issueLinks).values({
      id,
      fromType: input.fromType,
      fromId:   input.fromId,
      toType:   input.toType,
      toId:     input.toId,
      linkType: input.linkType,
      createdBy: input.createdBy,
    });
    return id;
  },

  /** 片方向を削除。双方向で管理したい呼び出し元は inverse 側も呼ぶ. */
  async delete(id: string): Promise<boolean> {
    const rows = await db.delete(schema.issueLinks)
      .where(eq(schema.issueLinks.id, id))
      .returning({ id: schema.issueLinks.id });
    return rows.length > 0;
  },

  /** `(type, id)` が from or to に現れる全リンク. */
  async listForTarget(type: TargetType, id: string) {
    const outgoing = await db.select().from(schema.issueLinks)
      .where(and(eq(schema.issueLinks.fromType, type), eq(schema.issueLinks.fromId, id)));
    const incoming = await db.select().from(schema.issueLinks)
      .where(and(eq(schema.issueLinks.toType,   type), eq(schema.issueLinks.toId,   id)));
    return { outgoing, incoming };
  },

  async exists(
    fromType: TargetType, fromId: string,
    toType:   TargetType, toId:   string,
    linkType: string,
  ): Promise<boolean> {
    const [row] = await db.select({ id: schema.issueLinks.id }).from(schema.issueLinks)
      .where(and(
        eq(schema.issueLinks.fromType, fromType),
        eq(schema.issueLinks.fromId,   fromId),
        eq(schema.issueLinks.toType,   toType),
        eq(schema.issueLinks.toId,     toId),
        eq(schema.issueLinks.linkType, linkType),
      ));
    return !!row;
  },
};

// ─── Comments (D4) ────────────────────────────────────────────

export const commentRepo = {
  async create(input: {
    targetType: TargetType; targetId: string;
    authorId: string; body: string;
    replyTo?: string | null;
  }) {
    const id = uuidv4();
    const now = new Date();
    await db.insert(schema.comments).values({
      id,
      targetType: input.targetType,
      targetId:   input.targetId,
      authorId:   input.authorId,
      body:       input.body,
      replyTo:    input.replyTo ?? null,
      createdAt:  now,
      updatedAt:  now,
    });
    return id;
  },

  async update(id: string, authorId: string, body: string): Promise<boolean> {
    const now = new Date();
    const rows = await db.update(schema.comments)
      .set({ body, updatedAt: now })
      .where(and(eq(schema.comments.id, id), eq(schema.comments.authorId, authorId)))
      .returning({ id: schema.comments.id });
    return rows.length > 0;
  },

  async delete(id: string, authorId: string): Promise<boolean> {
    const rows = await db.delete(schema.comments)
      .where(and(eq(schema.comments.id, id), eq(schema.comments.authorId, authorId)))
      .returning({ id: schema.comments.id });
    return rows.length > 0;
  },

  async listForTarget(type: TargetType, targetId: string) {
    return db.select().from(schema.comments)
      .where(and(
        eq(schema.comments.targetType, type),
        eq(schema.comments.targetId,   targetId),
      ))
      .orderBy(schema.comments.createdAt);
  },
};

// ─── Custom field values (D1) ─────────────────────────────────

export const customFieldValueRepo = {
  async upsert(input: {
    moduleId: string; fieldId: string;
    targetType: TargetType; targetId: string;
    value: unknown;
  }): Promise<void> {
    const now = new Date();
    // Drizzle SQLite の onConflict は unique index に沿う.
    await db.insert(schema.customFieldValues)
      .values({
        id: uuidv4(),
        moduleId:  input.moduleId,
        fieldId:   input.fieldId,
        targetType: input.targetType,
        targetId:   input.targetId,
        value:      input.value,
        updatedAt:  now,
      })
      .onConflictDoUpdate({
        target: [
          schema.customFieldValues.moduleId,
          schema.customFieldValues.fieldId,
          schema.customFieldValues.targetType,
          schema.customFieldValues.targetId,
        ],
        set: { value: input.value, updatedAt: now },
      });
  },

  async listForTarget(type: TargetType, targetId: string) {
    return db.select().from(schema.customFieldValues)
      .where(and(
        eq(schema.customFieldValues.targetType, type),
        eq(schema.customFieldValues.targetId,   targetId),
      ));
  },

  async delete(moduleId: string, fieldId: string, type: TargetType, targetId: string): Promise<boolean> {
    const rows = await db.delete(schema.customFieldValues)
      .where(and(
        eq(schema.customFieldValues.moduleId,   moduleId),
        eq(schema.customFieldValues.fieldId,    fieldId),
        eq(schema.customFieldValues.targetType, type),
        eq(schema.customFieldValues.targetId,   targetId),
      ))
      .returning({ id: schema.customFieldValues.id });
    return rows.length > 0;
  },
};

// ─── Workflow transitions (D2) ────────────────────────────────

export const workflowRepo = {
  async record(input: {
    targetType: TargetType; targetId: string;
    fromState: string; toState: string;
    performedBy: string;
  }) {
    const id = uuidv4();
    await db.insert(schema.workflowTransitions).values({
      id,
      targetType: input.targetType,
      targetId:   input.targetId,
      fromState:  input.fromState,
      toState:    input.toState,
      performedBy: input.performedBy,
    });
    return id;
  },

  async history(type: TargetType, targetId: string, limit = 50) {
    return db.select().from(schema.workflowTransitions)
      .where(and(
        eq(schema.workflowTransitions.targetType, type),
        eq(schema.workflowTransitions.targetId,   targetId),
      ))
      .orderBy(desc(schema.workflowTransitions.performedAt))
      .limit(limit);
  },
};
