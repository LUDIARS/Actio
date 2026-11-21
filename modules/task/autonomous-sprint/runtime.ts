import { secretManager } from "../../../src/config/secrets.js";
import { dialect } from "../../../src/db/connection.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { checkSprintBreaker } from "./breaker.js";

export function startAutonomousSprintTick(warn: (message: string) => void, intervalMs = 30_000): () => void {
  if (dialect === "mysql") return () => {}; // Planning is unavailable on MySQL.
  const abort = new AbortController();
  let ticking = false;
  const tick = async (): Promise<void> => {
    if (ticking || abort.signal.aborted) return;
    ticking = true;
    try {
      const runner = planningRepositories().autonomousRunner;
      for (const run of await runner.candidates()) {
        abort.signal.throwIfAborted();
        try {
          const request = await runner.step(run, new Date());
          if (!request) continue;
          const verdict = await checkSprintBreaker(secretManager.get("CONCORDIA_URL"), abort.signal);
          abort.signal.throwIfAborted();
          await runner.step(run, new Date(), { ...request, verdict });
        } catch {
          if (!abort.signal.aborted) warn("[autonomous-sprint] 自律スプリントの進行処理に失敗しました");
        }
      }
    } catch {
      if (!abort.signal.aborted) warn("[autonomous-sprint] 自律スプリントの取得に失敗しました");
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => { clearInterval(timer); abort.abort(); };
}
