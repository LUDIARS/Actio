// @spec スプリントフェーズの通知と受信
import { dialect } from "../../../src/db/connection.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { secretManager } from "../../../src/config/secrets.js";
import { resolveCernereDiscordUser } from "../../../src/auth/cernere-client.js";
import { SprintDialogueClient } from "./concordia-client.js";
import { runSprintGateCycle } from "./worker.js";
/** Called only by the real server entrypoint, never imported tests or request handlers. */
export function startSprintGateTick(warn: (message: string) => void, intervalMs = 30000): () => void {
    if (dialect === "mysql")
        return () => { }; // Planning explicitly returns 501 for this deployment.
    const controller = new AbortController();
    let running = false;
    const tick = async (): Promise<void> => {
        if (running || controller.signal.aborted)
            return;
        running = true;
        try {
            await runSprintGateCycle({ store: planningRepositories().gates, concordia: () => new SprintDialogueClient(secretManager.get("CONCORDIA_URL"), controller.signal), resolveIdentity: resolveCernereDiscordUser, now: () => new Date(), signal: controller.signal, warn: message => warn("[sprint-gates] " + message) });
        }
        catch (error) {
            if (!controller.signal.aborted)
                warn("[sprint-gates] " + (error instanceof Error ? error.message : "cycle failed"));
        }
        finally {
            running = false;
        }
    };
    const timer = setInterval(() => void tick(), intervalMs);
    timer.unref();
    void tick();
    return () => { clearInterval(timer); controller.abort(); };
}
