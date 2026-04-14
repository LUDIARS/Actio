/**
 * Event Plugin Registry
 *
 * Schedula コア「予定 (Event)」を生成・拡張するプラグインの登録/取得。
 * 各モジュール初期化時に registerEventPlugin() を呼び出して登録する。
 *
 * managed:
 *   - "core":     events テーブルに直接書き込む (シンプルなプラグイン)
 *   - "external": 独自テーブルで管理し、ProviderAPI 経由で events と統合
 *                 (例: pm の場合は pm_tasks を保持しつつ tasks と統合)
 */

import type { EventPlugin } from "./shared/types.js";

const plugins: EventPlugin[] = [];

export function registerEventPlugin(plugin: EventPlugin): void {
  if (plugins.some((p) => p.id === plugin.id)) return;
  plugins.push(plugin);
}

export function getEventPlugins(): EventPlugin[] {
  return [...plugins];
}

export function getEventPlugin(id: string): EventPlugin | undefined {
  return plugins.find((p) => p.id === id);
}
