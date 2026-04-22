/**
 * WS コマンドディスパッチャ
 *
 * module_request メッセージを受け取り、登録済みハンドラにルーティングする。
 *
 * ## Issue #111 S1: 認証ガード
 *
 * 以前は handler 存在確認のみで userId を素通ししていたため、`userId`
 * が空 / "anonymous" / "unknown" でも実行できてしまっていた。モジュール側が
 * 毎回チェックする前提だと漏れが必然だったので、**dispatcher 層で一律に
 * reject** する方針に変更。
 *
 * - 既定: 空 / "anonymous" / "unknown" の userId は `auth_required`
 *   で reject される (`requireAuth: true` 扱い)。
 * - `requireAuth: false` で登録されたコマンドだけが匿名通過を許す。
 * - `requireRole` 指定時は userRole が一致/上位でない場合 reject。
 */

import type { WsRequiredRole } from "@ludiars/schedula-sdk";

// ── 型定義 ──────────────────────────────────────────

export type CommandHandler = (userId: string, payload: unknown) => Promise<unknown>;

export interface CommandEntry {
  handler: CommandHandler;
  /** 既定 true. false で匿名許可. */
  requireAuth: boolean;
  /** 必要ロール (未指定なら requireAuth だけチェック). */
  requireRole?: WsRequiredRole;
}

// ── レジストリ ──────────────────────────────────────

/** module → action → entry */
const handlers = new Map<string, Map<string, CommandEntry>>();

// ── 登録 API ──────────────────────────────────────

/**
 * WS コマンドハンドラを登録する (旧シグネチャ互換).
 *
 * ```typescript
 * registerCommand("calendar", "create_event", async (userId, payload) => {
 *   return await calendarRepo.create(userId, payload);
 * });
 * ```
 *
 * requireAuth は常に `true` で登録される (= 認証必須)。匿名許可や
 * role gate が必要な場合は `registerCommandEntry()` を使う。
 */
export function registerCommand(
  module: string,
  action: string,
  handler: CommandHandler,
): void {
  registerCommandEntry(module, action, { handler, requireAuth: true });
}

export function registerCommandEntry(
  module: string,
  action: string,
  entry: CommandEntry,
): void {
  if (!handlers.has(module)) handlers.set(module, new Map());
  handlers.get(module)!.set(action, entry);
}

/**
 * 全ハンドラを消去 (テスト専用). production コードからは呼ばない。
 */
export function __clearCommandsForTest(): void {
  handlers.clear();
}

// ── ディスパッチ ────────────────────────────────────

export class DispatcherAuthError extends Error {
  constructor(
    message: string,
    public readonly code: "auth_required" | "forbidden" = "auth_required",
  ) {
    super(message);
    this.name = "DispatcherAuthError";
  }
}

function isAnonymous(userId: string | null | undefined): boolean {
  if (!userId) return true;
  const lowered = userId.trim().toLowerCase();
  return lowered === "" || lowered === "anonymous" || lowered === "unknown";
}

/** ロール階層: `admin` / `system_admin` は最上位として何でも通す. */
function roleSatisfies(required: WsRequiredRole, actual: string | undefined): boolean {
  if (!actual) return false;
  if (actual === "admin" || actual === "system_admin") return true;
  if (required === actual) return true;
  // group_owner > group_leader > group_member の階層
  const rank: Record<string, number> = {
    group_member: 1,
    group_leader: 2,
    group_owner:  3,
  };
  const reqR = rank[required];
  const actR = rank[actual];
  if (reqR !== undefined && actR !== undefined) return actR >= reqR;
  return false;
}

export interface DispatchContext {
  userId:   string;
  userRole: string;
}

/**
 * module_request をディスパッチし、結果を返す。
 *
 * 後方互換のため第 3 引数には `string` (userId only) も受け付けるが、
 * その場合 userRole は `"general"` 扱い (= system_admin / group_* 要求が
 * あれば reject される)。
 *
 * @throws {Error}                 未登録の module / action
 * @throws {DispatcherAuthError}   auth 要件を満たさない場合
 */
export async function dispatch(
  module: string,
  action: string,
  ctxOrUserId: DispatchContext | string,
  payload: unknown,
): Promise<unknown> {
  const ctx: DispatchContext =
    typeof ctxOrUserId === "string"
      ? { userId: ctxOrUserId, userRole: "general" }
      : ctxOrUserId;

  const mod = handlers.get(module);
  if (!mod) throw new Error(`Unknown module: ${module}`);
  const entry = mod.get(action);
  if (!entry) throw new Error(`Unknown action: ${module}.${action}`);

  // S1 auth gate
  if (entry.requireAuth && isAnonymous(ctx.userId)) {
    throw new DispatcherAuthError(
      `Authentication required for ${module}.${action}`,
      "auth_required",
    );
  }
  if (entry.requireRole && !roleSatisfies(entry.requireRole, ctx.userRole)) {
    throw new DispatcherAuthError(
      `Role "${entry.requireRole}" required for ${module}.${action}`,
      "forbidden",
    );
  }

  return entry.handler(ctx.userId, payload);
}

/**
 * 登録済みのモジュール・アクション一覧を返す（デバッグ用）。
 */
export function listCommands(): Array<{
  module:       string;
  action:       string;
  requireAuth:  boolean;
  requireRole?: WsRequiredRole;
}> {
  const result: Array<{
    module:       string;
    action:       string;
    requireAuth:  boolean;
    requireRole?: WsRequiredRole;
  }> = [];
  for (const [module, actions] of handlers) {
    for (const [action, entry] of actions) {
      result.push({
        module,
        action,
        requireAuth:  entry.requireAuth,
        requireRole:  entry.requireRole,
      });
    }
  }
  return result;
}
