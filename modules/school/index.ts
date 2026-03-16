/**
 * School Module — 学校カリキュラム管理モジュール
 *
 * Schedula のオプショナルモジュールとして、学校・教育機関向けの
 * 授業スケジュール管理機能を提供します。
 *
 * 含まれるサブモジュール:
 *   M1: 授業予定組立ツール (CSV取込 → CSPソルバー → 時間割生成)
 *   M2: データ統合 (授業・個人予定・予約を統合ビューに集約)
 *   M3: オートスケジューラ (グループの空き時間検索・ミーティング提案)
 *
 * コアの予約システムやWebhook通知はプラットフォーム側に属し、
 * このモジュールとは独立して動作します。
 */

import { Hono } from "hono";
import { m1 } from "../schedule/routes.js";
import { m2 } from "../integration/routes.js";
import { m3 } from "../auto-scheduler/routes.js";
import { DAY_LABELS, getPeriodTime, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { SchulaModule } from "../../src/shared/types.js";

const schoolRouter = new Hono();
schoolRouter.route("/m1", m1);
schoolRouter.route("/m2", m2);
schoolRouter.route("/m3", m3);

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
  description: "学校カリキュラム管理 — 授業時間割の自動生成・データ統合・グループスケジューリング",
  routes: schoolRouter,
  basePath: "/api/school",
  submodules: [
    { id: "m1", name: "授業予定組立ツール", path: "/m1" },
    { id: "m2", name: "データ統合", path: "/m2" },
    { id: "m3", name: "オートスケジューラ", path: "/m3" },
  ],
};
