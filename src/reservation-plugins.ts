/**
 * Reservation Plugin Registry
 *
 * 予約プラグインの登録・取得を管理するレジストリ。
 * 各モジュール初期化時に registerReservationPlugin() を呼び出してプラグインを登録する。
 */

import type { ReservationPlugin } from "./shared/types.js";

const plugins: ReservationPlugin[] = [];

export function registerReservationPlugin(plugin: ReservationPlugin) {
  // 重複登録を防ぐ
  if (plugins.some((p) => p.id === plugin.id)) return;
  plugins.push(plugin);
}

export function getReservationPlugins(): ReservationPlugin[] {
  return [...plugins];
}
