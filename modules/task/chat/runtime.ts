// @implements AT-SPRINT-CHAT-INTEGRATION
import { randomUUID } from "node:crypto";
import { dialect } from "../../../src/db/connection.js";
import { chatRecords } from "../../../src/db/chat-repository.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { secretManager } from "../../../src/config/secrets.js";
import { ChatError, type Connection } from "./contracts.js";
import { chatProviders } from "./providers.js";
import { runChatConnection } from "./cycle.js";

export function startChatTick(warn: (message: string) => void): () => void {
  if (dialect === "mysql") return () => {};
  const controller = new AbortController(), owner = randomUUID();
  let running = false;
  const tick = async (): Promise<void> => {
    if (running || controller.signal.aborted) return;
    running = true;
    let records: ReturnType<typeof chatRecords> | undefined;
    try {
      records = chatRecords();
      const store = records;
      const ownsLease = async (): Promise<boolean> => !controller.signal.aborted && store.lease(owner, new Date(), 300_000);
      if (!await ownsLease()) return;
      for (const connection of await records.allOfKind<Connection>("connection")) {
        if (!connection.enabled || !await ownsLease()) continue;
        let providers: ReturnType<typeof chatProviders> | undefined;
        try {
          providers = chatProviders(connection, controller.signal);
          await runChatConnection(records, connection, providers.transport, providers.reviewer,
            planningRepositories().gates, secretManager.getRequired("FRONTEND_URL").replace(/\/$/, ""), () => new Date(), controller.signal, ownsLease);
          await records.save(connection.teamId, "health", connection.platform, { error: null, at: new Date().toISOString() }, new Date());
        } catch (error) {
          warn("[chat] 接続処理を完了できませんでした。チームのチャット設定を確認してください");
          const prior = await records.get<{ visibilityBlocked?: boolean }>(connection.teamId, "health", connection.platform);
          await records.save(connection.teamId, "health", connection.platform, { error: "接続・権限・配送を確認してください。処理は未完了です",
            visibilityBlocked: prior?.visibilityBlocked || error instanceof ChatError && (error.status === 400 || error.status === 403), at: new Date().toISOString() }, new Date());
        } finally { providers?.transport.close(); }
      }
    } catch { if (!controller.signal.aborted) warn("[chat] チャット処理の保存領域を確認してください"); }
    finally {
      try { await records?.releaseLease(owner); }
      catch { warn("[chat] 実行権の解放を確認できません。期限まで次の取得を待ちます"); }
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
  void tick();
  return () => { clearInterval(timer); controller.abort(); };
}
