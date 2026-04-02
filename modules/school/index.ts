/**
 * CALICULA (M1) — 学校カリキュラム管理モジュール
 *
 * Schedula のオプショナルモジュールとして、学校・教育機関向けの
 * 授業スケジュール管理機能を提供します。
 *
 * CALICULA: 学校カリキュラム管理 (学科・講師・カリキュラム CRUD + マイグレーション)
 *   - 旧 M2 (データ統合) と旧 M3 (オートスケジューラ) を M1 に統合済み
 *   - カリキュラム配置データをスケジューラのプラン形式に自動変換
 *   - 学科をグループとして自動登録するマイグレーション
 *   - 施設予約 (教室・会議室の予約管理)
 */

import { Hono } from "hono";
import { m1 } from "../schedule/routes.js";
import { facilityBooking } from "./facility-booking/routes.js";
import { registerFacilityBookingPlugin } from "./facility-booking/index.js";
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { SchulaModule } from "../../src/shared/types.js";

const schoolRouter = new Hono();
// NOTE: facility-booking は /m1 の requireRole("admin") を避けるため別パスでマウント
schoolRouter.route("/facility-booking", facilityBooking);
schoolRouter.route("/m1", m1);

// 時間割メタ情報
schoolRouter.get("/timetable", (c) => {
  const periods = Array.from({ length: PERIODS_COUNT }, (_, i) => ({
    period: i + 1,
    ...getPeriodTime(i),
  }));

  return c.json({
    days: DAY_LABELS,
    periods,
    description: "1コマ=1時間, 9:30開始, 月〜日(7日間)",
  });
});

// プラグイン登録
registerFacilityBookingPlugin();

export const schoolModule: SchulaModule = {
  name: "calicula",
  description: "CALICULA — 学校カリキュラム管理・学科・講師・マイグレーション・施設予約",
  routes: schoolRouter,
  basePath: "/api/school",
  submodules: [
    { id: "m1", name: "カリキュラム管理", path: "/m1" },
    { id: "facility-booking", name: "施設予約", path: "/facility-booking" },
  ],
};
