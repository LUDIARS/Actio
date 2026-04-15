/**
 * 通知コアハンドラ (Nuntius 完全移行版)
 *
 * 旧: ローカル EventBus + in-app notifications + webhook fan-out
 * 新: emitEvent → Nuntius topic publish (Nuntius 側で配信)
 *
 * Nuntius が未設定の環境ではフォールバックとしてログのみ出力する。
 */

import { nuntiusClient } from "../../../src/lib/nuntius-client.js";

/**
 * イベントを Nuntius topic に publish する。
 * topic 命名: "actio.{event}"
 */
export async function emitEvent(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!nuntiusClient.isConfigured()) {
    console.warn(`[notification] Nuntius not configured; dropped event: ${event}`);
    return;
  }
  try {
    await nuntiusClient.publish({
      topic: `actio.${event}`,
      payload: data,
      source: "actio",
    });
  } catch (err) {
    console.error(`[notification] Nuntius publish failed for ${event}:`, err instanceof Error ? err.message : err);
  }
}
