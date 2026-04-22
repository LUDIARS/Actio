/**
 * Plugin Event Bus — Issue #111 D5
 *
 * 緩結合 pub/sub. モジュールが `ctx.events.emit/subscribe` で
 * topic 単位に通信する. 呼び出しは in-process.
 *
 * ## 設計方針
 * - handler の throw は **各購読で独立に catch + ログ**。emit 呼び出し
 *   元の module は他モジュールのバグで落ちない.
 * - 同期版は提供しない (非同期のみ). handler は `Promise<void>` 返却.
 * - subscribe は dispose function を返す. 大きめ life time を持つ場合は
 *   module `onUninstall` で必ず呼ぶこと.
 */

import type { EventHandler } from "@ludiars/schedula-sdk";

export class EventBus {
  private subs = new Map<string, Set<{ source: string; handler: EventHandler }>>();

  subscribe(topic: string, source: string, handler: EventHandler): () => void {
    let set = this.subs.get(topic);
    if (!set) { set = new Set(); this.subs.set(topic, set); }
    const entry = { source, handler };
    set.add(entry);
    return () => {
      const s = this.subs.get(topic);
      if (s) s.delete(entry);
    };
  }

  async emit(topic: string, payload: unknown, source: string): Promise<void> {
    const set = this.subs.get(topic);
    if (!set || set.size === 0) return;
    const work = [...set].map(async (e) => {
      try {
        await e.handler(payload, source);
      } catch (err) {
        console.warn(`[events] ${topic} handler (subscriber=${e.source}) threw:`, err);
      }
    });
    await Promise.all(work);
  }

  /** テスト用: 全購読を解除. */
  __clearForTest(): void { this.subs.clear(); }

  /** デバッグ用: 全 topic の購読数を返す. */
  stats(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.subs) out[k] = v.size;
    return out;
  }
}

/** ホスト全体で共有する単一バス. 起動時に 1 個. */
export const pluginEventBus = new EventBus();
