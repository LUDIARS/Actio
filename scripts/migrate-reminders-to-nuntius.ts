/**
 * 既存の Schedula reminder データを Nuntius に一括移行する。
 *
 * 使い方:
 *   npx tsx scripts/migrate-reminders-to-nuntius.ts
 *
 * 動作:
 *   1. status="pending" の reminder を全件取得
 *   2. Nuntius に schedule リクエストを送信 (idempotencyKey = reminder.id)
 *   3. 成功件数・失敗件数をレポート
 *
 * ※ Phase 4 (レガシー削除) 前に実行する想定。
 *   shadow write (routes.ts) で新規分は同期されているので、本スクリプトは
 *   過去分を一括移送するためのもの。Idempotent なので何度実行しても安全。
 */

import { initSecrets } from "../src/config/secrets.js";
import { reminderRepo } from "../src/db/repository.js";
import { nuntiusClient } from "../src/lib/nuntius-client.js";

async function main(): Promise<void> {
  await initSecrets();

  if (!nuntiusClient.isConfigured()) {
    console.error("[migrate] Nuntius が未設定 (NUNTIUS_URL / CERNERE_PROJECT_CLIENT_ID/SECRET 必須)");
    process.exit(1);
  }

  const reminders = await reminderRepo.findAllPending();

  console.log(`[migrate] pending reminders: ${reminders.length}`);

  let ok = 0;
  let failed = 0;
  for (const r of reminders) {
    try {
      await nuntiusClient.schedule({
        userId: r.userId,
        channel: "webhook",
        sendAt: r.remindAt,
        payload: {
          title: r.title,
          description: r.description ?? "",
        },
        source: "schedula.reminder.migration",
        idempotencyKey: r.id,
      });
      ok++;
    } catch (err) {
      failed++;
      console.warn(`[migrate] failed ${r.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[migrate] done. success=${ok} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
