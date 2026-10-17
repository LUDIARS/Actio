/**
 * GET /api/tasks の不透明カーソル。
 *
 * 中身は前ページ最後の行の並びキー (src/db/task-list-keyset.ts) を base64url の JSON に
 * したもの。 消費側は中身を解釈せず nextCursor をそのまま返す。 並び順 (sort) を
 * 埋め込み、 別の並び順のカーソルは受け付けない。
 */

import type { TaskListCursorKey, TaskListSort } from "../../../src/db/repository.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:6cc70202 */
import augurContract_ee65489f from '../../../contracts/task-list-cursor.contract.ts'; /* augur-inject:contract-predicate:997d99eb */

const CURSOR_VERSION = 1;

export function encodeTaskListCursor(key: TaskListCursorKey): string {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, ...key }), "utf8").toString("base64url");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toKey(payload: Record<string, unknown>): TaskListCursorKey | null {
  if (typeof payload.id !== "string" || payload.id === "") return null;
  if (payload.sort === "default") {
    if (!isFiniteNumber(payload.updatedAt)) return null;
    return { sort: "default", updatedAt: payload.updatedAt, id: payload.id };
  }
  if (payload.sort === "personal") {
    if (!isFiniteNumber(payload.rank) || !isFiniteNumber(payload.createdAt)) return null;
    if (payload.deadline !== null && !isFiniteNumber(payload.deadline)) return null;
    return { sort: "personal", rank: payload.rank, deadline: payload.deadline, createdAt: payload.createdAt, id: payload.id };
  }
  return null;
}

/** 壊れた値・版違い・別の並び順のカーソルは null */
export function decodeTaskListCursor(raw: string, sort: TaskListSort): TaskListCursorKey | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (record.v !== CURSOR_VERSION || record.sort !== sort) return null;
  return toKey(record);
}
// @ts-expect-error augur-inject
decodeTaskListCursor = contract(decodeTaskListCursor, { ...augurContract_ee65489f, contractId: 'C-19', mode: 'observe', sample: 1, where: 'modules/task/list/cursor.ts:36', rule: 'contract-wrap', id: 'ee65489f' }); /* augur-inject:contract-wrap:ee65489f */
