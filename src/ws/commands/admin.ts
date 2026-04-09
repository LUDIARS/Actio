/**
 * WS Command Handlers — Admin module (settings + user role management)
 */

import { registerCommand } from "../dispatcher.js";
import {
  appSettingsRepo,
  userRepo,
} from "../../db/repository.js";
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
  const caller = await userRepo.findById(userId);
  if (!caller || caller.role !== "admin") {
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

interface UpdateUserRolePayload {
  targetUserId: string;
  role: string;
}

registerCommand("admin", "update_user_role", async (userId, payload) => {
  const body = payload as UpdateUserRolePayload;
  if (!body.targetUserId) throw new Error("targetUserId is required");
  if (!body.role) throw new Error("role is required");

  // Admin check
  const caller = await userRepo.findById(userId);
  if (!caller || caller.role !== "admin") {
    throw new Error("管理者権限が必要です");
  }

  if (!["admin", "group_leader", "general"].includes(body.role)) {
    throw new Error("無効なロールです。admin, group_leader, general のいずれかを指定してください");
  }

  const targetUser = await userRepo.findById(body.targetUserId);
  if (!targetUser) throw new Error("ユーザーが見つかりません");

  await userRepo.update(body.targetUserId, { role: body.role, updatedAt: new Date() });

  logActivity(userId, caller.name || "Unknown", "ユーザーロール変更", `ユーザー「${targetUser.name}」のロールが「${body.role}」に変更されました`);

  return {
    user: { id: body.targetUserId, name: targetUser.name, email: targetUser.email, role: body.role },
    message: "ロールを変更しました",
  };
});
