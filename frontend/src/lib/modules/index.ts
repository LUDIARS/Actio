/**
 * Module registration — 全モジュールをレジストリに登録
 *
 * アプリ起動時にこのファイルをインポートすることで、
 * 全モジュールのメニュー・ブロック・ルートが登録される。
 *
 * 新モジュール追加手順:
 *   1. modules/my-module.ts を作成
 *   2. このファイルにインポートを追加
 *   3. registerAllModules() 内で moduleRegistry.registerModule() を呼ぶ
 */
import { moduleRegistry } from "../module-registry";
import { coreModule } from "./core";
import { tasksModule } from "./tasks";
import { groupModule } from "./group";
// m1-school / reservation / integration / cocoiru は Schedula / Aedilis に分離
// (2026-05-20 split-task-only)
import { pmModule } from "./pm";
import { machinaModule } from "./machina";
import { notificationModule } from "./notification";
import { adminModule } from "./admin";

let registered = false;

/** 全モジュールをレジストリに登録 (冪等) */
export function registerAllModules(): void {
  if (registered) return;
  registered = true;

  moduleRegistry.registerModule(coreModule);
  moduleRegistry.registerModule(tasksModule);
  moduleRegistry.registerModule(groupModule);
  moduleRegistry.registerModule(pmModule);
  moduleRegistry.registerModule(machinaModule);
  moduleRegistry.registerModule(notificationModule);
  moduleRegistry.registerModule(adminModule);
}
