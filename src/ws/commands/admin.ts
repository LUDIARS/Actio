/**
 * WS Command Handlers — Admin module (settings + user role management)
 */

import { registerCommand } from "../dispatcher.js";
import {
  appSettingsRepo,
} from "../../db/repository.js";
import { getUserInfo } from "../../auth/user-info.js";
import { logActivity } from "../../activity-logger.js";

// ── Default settings (matches modules/settings/routes.ts) ──

const SETTING_DEFAULTS: Record<string, string> = {
  "session.refreshTokenDays": "30",
  "session.accessTokenMinutes": "60",
  "app.name": "Schedula",
};

// ── admin.update_settings ──

interface UpdateSettingsPayload {
  settings: Record<string, string>;
}

registerCommand("admin", "update_settings", async (userId, payload) => {
  const body = payload as UpdateSettingsPayload;

  if (!body.settings || typeof body.settings !== "object") {
    throw new Error("settings オブジェクトが必要です");
  }

  // Admin check: caller must be admin
  const caller = await getUserInfo(userId);
  if (caller.role !== "admin") {
    throw new Error("管理者権限が必要です");
  }

  for (const [key, value] of Object.entries(body.settings)) {
    if (typeof value !== "string") continue;
    await appSettingsRepo.upsert(key, value);
  }

  // 更新後の値を返す
  const rows = await appSettingsRepo.findAll();
  const settings: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  logActivity(userId, caller.name || "Unknown", "アプリ設定更新", `アプリ設定が更新されました（${Object.keys(body.settings).join(", ")}）`);

  return { settings, message: "設定を保存しました" };
});

// ── admin.update_user_role ──
// role は Cernere 側で管理する (Schedula DB に保存しない)。
// 本コマンドは廃止。Cernere の admin UI でロール変更してください。

registerCommand("admin", "update_user_role", async () => {
  throw new Error(
    "Role management has moved to Cernere. Use the Cernere admin UI to change user roles.",
  );
});
