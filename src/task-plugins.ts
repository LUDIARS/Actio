/**
 * Task Plugin Registry
 *
 * Schedula コア「タスク (Task)」を生成・拡張するプラグインの登録/取得。
 * 各モジュール初期化時に registerTaskPlugin() を呼び出して登録する。
 *
 * managed:
 *   - "core":     tasks テーブルに直接書き込む (シンプルなプラグイン)
 *   - "external": 独自テーブルで管理 (例: pm_tasks) し、ProviderAPI 経由で
 *                 tasks と統合
 */

import type { TaskPlugin } from "./shared/types.js";

const plugins: TaskPlugin[] = [];

export function registerTaskPlugin(plugin: TaskPlugin): void {
  if (plugins.some((p) => p.id === plugin.id)) return;
  plugins.push(plugin);
}

export function getTaskPlugins(): TaskPlugin[] {
  return [...plugins];
}

export function getTaskPlugin(id: string): TaskPlugin | undefined {
  return plugins.find((p) => p.id === id);
}
