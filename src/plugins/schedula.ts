/**
 * Schedula — Id Service プラグイン
 *
 * Schedula 固有のユーザープロフィールフィールドを
 * Id Service のプラグインとして登録する。
 *
 * サービス固有フィールド:
 *   - major: 学科・専攻
 *   - calendarAccessId: Google Calendar 連携用 ID
 */

import type { PluginRegistry } from "@ludiars/cernere-id-service";

export function registerSchedulaPlugin(registry: PluginRegistry): void {
  registry.register({
    serviceId: "schedula",
    serviceName: "Schedula",

    profileFields: {
      major: {
        type: "string",
        required: false,
        description: "学科・専攻",
      },
      calendarAccessId: {
        type: "string",
        required: false,
        description: "Google Calendar 連携用 ID",
      },
    },

    // ユーザー一覧にも major を表示
    listFields: ["major"],

    // /me レスポンスに含めるフィールド
    meFields: ["major", "calendarAccessId"],

    /**
     * /me レスポンス整形
     * 現在は users テーブルに直接格納されているため、
     * profileData が空の場合は何も返さない (後方互換)。
     * プロフィール分離後はここで profileData からフィールドを返す。
     */
    formatForMe(profileData: Record<string, unknown>) {
      const result: Record<string, unknown> = {};
      if (profileData.major !== undefined) result.major = profileData.major;
      if (profileData.calendarAccessId !== undefined) result.calendarAccessId = profileData.calendarAccessId;
      return result;
    },
  });
}
