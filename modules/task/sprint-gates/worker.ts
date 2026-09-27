// @spec スプリントフェーズの通知と受信
import type { SprintGateStore } from "./store.js";
import type { CcEvent, Projection, DecisionOutcome } from "./contracts.js";
import { dialogueKey } from "./persistence.js";
import { SprintDialogueClient } from "./concordia-client.js";
export interface GateCycleDependencies {
    store: Pick<SprintGateStore, "eventOutcome" | "rejectExternal" | "decide" | "candidates" | "view" | "pending" | "delivery">;
    concordia: () => SprintDialogueClient;
    resolveIdentity: (discordUserId: string) => Promise<string | null>;
    now: () => Date;
    signal: AbortSignal;
    warn: (message: string) => void;
    /** Teams explicitly moved to ordinary chat channels must not publish duplicate forum dialogues. */
    excludedTeams?: ReadonlySet<string>;
}
async function handleEvent(deps: GateCycleDependencies, event: CcEvent): Promise<DecisionOutcome> {
    const prior = await deps.store.eventOutcome("cc:" + event.eventId);
    if (prior)
        return prior;
    const reject = (reason: string) => deps.store.rejectExternal(event.teamId, event.sprintId, "cc:" + event.eventId, reason, deps.now());
    if (event.dialogueKey !== dialogueKey(event.teamId, event.sprintId))
        return reject("会話の対象が一致しません。Actio の最新フェーズを確認してください");
    let actor: string | null;
    try {
        actor = await deps.resolveIdentity(event.actor.discordUserId);
    }
    catch {
        return reject("Cernere の本人照合を利用できません。Actio にログインして /tasks/planning から判断してください（接続設定・identity_claims の discord_id 宣言を確認）");
    }
    if (!actor)
        return reject("Discord と Cernere の本人連携を確認できません。Actio にログインして /tasks/planning から判断してください");
    deps.signal.throwIfAborted();
    return deps.store.decide(event.teamId, event.sprintId, actor, { eventId: "cc:" + event.eventId, action: event.action, expectedRevision: event.revision, sourceFingerprint: event.sourceFingerprint, reason: event.reason, taskIds: event.taskIds }, deps.now(), true);
}
/** Recoverable owner: phase/state commit precedes external delivery, event outcome precedes ack. */
export async function runSprintGateCycle(deps: GateCycleDependencies): Promise<void> {
    for (const row of await deps.store.candidates()) {
        if (deps.excludedTeams?.has(row.teamId)) continue;
        deps.signal.throwIfAborted();
        try {
            await deps.store.view(row.teamId, row.id, deps.now());
        }
        catch (error) {
            deps.warn(`スプリント状態を更新できません: ${error instanceof Error ? error.message : "unknown"}`);
        }
    }
    const pending = (await deps.store.pending()).filter(row => !deps.excludedTeams?.has(row.teamId));
    let client: SprintDialogueClient;
    try {
        client = deps.concordia();
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "Cc 接続設定が不正です";
        for (const row of pending)
            await deps.store.delivery(row, { status: "failed", threadUrl: row.threadUrl, lastError: reason });
        throw error;
    }
    for (const row of pending) {
        deps.signal.throwIfAborted();
        try {
            await deps.store.delivery(row, await client.publish(JSON.parse(row.payloadJson) as Projection));
        }
        catch (error) {
            if (deps.signal.aborted)
                throw error;
            await deps.store.delivery(row, { status: "unknown", threadUrl: row.threadUrl, lastError: error instanceof Error ? error.message : "通知の受付結果が不明です" });
        }
    }
    for (const event of await client.events()) {
        if (deps.excludedTeams?.has(event.teamId)) {
            await client.ack(event.eventId, { outcome: "rejected", reason: "通常チャンネルへ移行済みです。Actioで最新状態を確認してください" });
            continue;
        }
        deps.signal.throwIfAborted();
        // Durable applied/rejected outcome makes lost ACK retries harmless.
        const outcome = await handleEvent(deps, event);
        deps.signal.throwIfAborted();
        await client.ack(event.eventId, outcome);
    }
}
