/**
 * WS コマンドディスパッチャ
 *
 * module_request メッセージを受け取り、
 * 登録済みハンドラにルーティングする。
 */

// ── 型定義 ──────────────────────────────────────────

type CommandHandler = (userId: string, payload: unknown) => Promise<unknown>;

// ── レジストリ ──────────────────────────────────────

/** module → action → handler */
const handlers = new Map<string, Map<string, CommandHandler>>();

/**
 * WS コマンドハンドラを登録する。
 *
 * ```typescript
 * registerCommand("calendar", "create_event", async (userId, payload) => {
 *   return await calendarRepo.create(userId, payload);
 * });
 * ```
 */
export function registerCommand(
  module: string,
  action: string,
  handler: CommandHandler,
): void {
  if (!handlers.has(module)) {
    handlers.set(module, new Map());
  }
  handlers.get(module)!.set(action, handler);
}

/**
 * module_request をディスパッチし、結果を返す。
 * 未登録のモジュール・アクションは Error を throw する。
 */
export async function dispatch(
  module: string,
  action: string,
  userId: string,
  payload: unknown,
): Promise<unknown> {
  const mod = handlers.get(module);
  if (!mod) {
    throw new Error(`Unknown module: ${module}`);
  }
  const handler = mod.get(action);
  if (!handler) {
    throw new Error(`Unknown action: ${module}.${action}`);
  }
  return handler(userId, payload);
}

/**
 * 登録済みのモジュール・アクション一覧を返す（デバッグ用）。
 */
export function listCommands(): Array<{ module: string; action: string }> {
  const result: Array<{ module: string; action: string }> = [];
  for (const [module, actions] of handlers) {
    for (const action of actions.keys()) {
      result.push({ module, action });
    }
  }
  return result;
}
