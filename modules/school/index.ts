/**
 * School Module — 学校カリキュラム管理モジュール
 *
 * Schedula のオプショナルモジュールとして、学校・教育機関向けの
 * 授業スケジュール管理機能を提供します。
 *
 * M1: 学校カリキュラム管理 (学科・講師・カリキュラム CRUD + マイグレーション)
 *   - 旧 M2 (データ統合) と旧 M3 (オートスケジューラ) を M1 に統合済み
 *   - カリキュラム配置データをスケジューラのプラン形式に自動変換
 *   - 学科をグループとして自動登録するマイグレーション
 *
 * コアの予約システムやWebhook通知はプラットフォーム側に属し、
 * このモジュールとは独立して動作します。
 */

import { Hono } from "hono";
import { m1 } from "../schedule/routes.js";
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { SchulaModule } from "../../src/shared/types.js";

const schoolRouter = new Hono();
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

export const schoolModule: SchulaModule = {
  name: "school",
  description: "学校カリキュラム管理 — 学科・講師・カリキュラム・マイグレーション",
  routes: schoolRouter,
  basePath: "/api/school",
  submodules: [
    { id: "m1", name: "学校カリキュラム管理", path: "/m1" },
  ],
};
