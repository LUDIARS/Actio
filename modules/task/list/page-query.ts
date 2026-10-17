/**
 * GET /api/tasks のページ分け・追加絞り込みパラメタの解析 (spec/feature/task-list-api.md)。
 *
 * limit / cursor / include / status (カンマ区切り) / q / category / assignee /
 * updated_since / due_after を読み、 不正値は誤り文言を返す (呼び出し側で 400)。
 * 既存パラメタ (scope / team_id / lane など) の解析は routes.ts に残す。
 */

import type { TaskListCursorKey, TaskListSort } from "../../../src/db/repository.js";
import { normalizeStatus } from "../personal.js";
import { decodeTaskListCursor } from "./cursor.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:705ada8e */
import augurContract_f54adb38 from '../../../contracts/task-list-page-query.contract.ts'; /* augur-inject:contract-predicate:486df091 */

export const DEFAULT_TASK_LIST_LIMIT = 100;
export const MAX_TASK_LIST_LIMIT = 500;

export interface TaskListPageQuery {
  sort: TaskListSort;
  limit: number;
  after: TaskListCursorKey | null;
  includeDescription: boolean;
  statuses: string[];
  q?: string;
  category?: string;
  assignee?: string;
  updatedSince?: Date;
  dueAfter?: Date;
}

export type TaskListPageQueryResult =
  | { ok: true; value: TaskListPageQuery }
  | { ok: false; error: string };

type RawQuery = Record<string, string | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLimit(raw: string | undefined): number | string {
  if (raw === undefined) return DEFAULT_TASK_LIST_LIMIT;
  if (!/^\d+$/.test(raw)) return "limit must be an integer between 1 and 500";
  const limit = Number(raw);
  if (limit < 1 || limit > MAX_TASK_LIST_LIMIT) return "limit must be an integer between 1 and 500";
  return limit;
}

function parseStatuses(raw: string | undefined): string[] | string {
  if (raw === undefined || raw === "") return [];
  const statuses: string[] = [];
  for (const part of raw.split(",").map((s) => s.trim())) {
    const normalized = normalizeStatus(part);
    if (!normalized) return "status must be a comma-separated list of open, in_progress, blocked, done, cancelled (todo/doing 可)";
    if (!statuses.includes(normalized)) statuses.push(normalized);
  }
  return statuses;
}

function parseInclude(raw: string | undefined): boolean | string {
  if (raw === undefined || raw === "") return false;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.some((p) => p !== "description")) return "include must be description";
  return true;
}

/** 空文字は「指定なし」と同じに扱う */
function optionalText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  return text ? text : undefined;
}

export function parseTaskListPageQuery(query: RawQuery): TaskListPageQueryResult {
  const sort: TaskListSort = query.sort === "personal" ? "personal" : "default";
  const limit = parseLimit(query.limit);
  if (typeof limit === "string") return { ok: false, error: limit };
  const statuses = parseStatuses(query.status);
  if (typeof statuses === "string") return { ok: false, error: statuses };
  const includeDescription = parseInclude(query.include);
  if (typeof includeDescription === "string") return { ok: false, error: includeDescription };

  let after: TaskListCursorKey | null = null;
  if (query.cursor !== undefined && query.cursor !== "") {
    after = decodeTaskListCursor(query.cursor, sort);
    if (!after) return { ok: false, error: "cursor is invalid (use nextCursor from the previous page with the same sort)" };
  }

  const value: TaskListPageQuery = { sort, limit, after, includeDescription, statuses };
  value.q = optionalText(query.q);
  value.category = optionalText(query.category);
  value.assignee = optionalText(query.assignee);
  for (const [name, field] of [["updated_since", "updatedSince"], ["due_after", "dueAfter"]] as const) {
    const raw = query[name];
    if (raw === undefined || raw === "") continue;
    const date = parseIsoDate(raw);
    if (!date) return { ok: false, error: `${name} must be an ISO 8601 date-time` };
    value[field] = date;
  }
  return { ok: true, value };
}
// @ts-expect-error augur-inject
parseTaskListPageQuery = contract(parseTaskListPageQuery, { ...augurContract_f54adb38, contractId: 'C-18', mode: 'observe', sample: 1, where: 'modules/task/list/page-query.ts:75', rule: 'contract-wrap', id: 'f54adb38' }); /* augur-inject:contract-wrap:f54adb38 */
