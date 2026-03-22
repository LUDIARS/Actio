/**
 * Integrations Module — 外部サービス連携
 *
 * Google Calendar 同期 + Notion 連携をまとめたモジュール
 */

import { Hono } from "hono";
import { googleCalendarSync } from "./google-calendar-sync.js";
import { notion } from "./notion.js";

const integrations = new Hono();

integrations.route("/google-calendar", googleCalendarSync);
integrations.route("/notion", notion);

export { integrations };
