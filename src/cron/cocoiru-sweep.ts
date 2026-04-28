/**
 * cocoiru schedule sweep — Actio 直叩き cron。
 *
 * cocoiru モジュールは「myplan の weekly slot に紐づけた `cocoiru_schedule_links`
 * を一定間隔で見て、現時点でアクティブな slot に対して `source: "schedule"`
 * の broadcast を投入する」という機能を `runScheduleSweep(ctx)` として
 * export している。Schedula SDK 側に正式 cron 機構が来るまでの暫定として、
 * Actio 本体が setInterval で 1 分ごとに叩く。
 *
 * 二重起動防止: timer をモジュールスコープで保持し、`startCocoiruScheduleSweep`
 * を複数回呼んでも再起動しない (既存 timer をそのまま使う)。
 *
 * 障害時挙動: tick 中の例外は console.error にだけ流して握りつぶす
 * (定期処理を止めない)。
 *
 * cocoiru パッケージが未インストールの環境では import で fail しないよう、
 * dynamic import + try/catch にする。
 */

import { buildModuleContextFromDef } from "../plugins/context.js";
import type { ScheduleSweepResult } from "@ludiars/schedula-module-cocoiru";

const SWEEP_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let cocoiruRef:
  | {
      def: typeof import("@ludiars/schedula-module-cocoiru").default;
      runScheduleSweep: (ctx: ReturnType<typeof buildModuleContextFromDef>) => Promise<ScheduleSweepResult>;
    }
  | null = null;

async function loadCocoiru(): Promise<typeof cocoiruRef> {
  if (cocoiruRef) return cocoiruRef;
  try {
    const mod = await import("@ludiars/schedula-module-cocoiru");
    cocoiruRef = {
      def: mod.default,
      runScheduleSweep: mod.runScheduleSweep,
    };
    return cocoiruRef;
  } catch (err) {
    console.warn(
      "[cron/cocoiru] @ludiars/schedula-module-cocoiru 未インストール — schedule sweep を停止 (%s)",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

async function tick(): Promise<void> {
  const ref = await loadCocoiru();
  if (!ref) return;
  try {
    const ctx = buildModuleContextFromDef(ref.def);
    const result = await ref.runScheduleSweep(ctx);
    if (result.emitted > 0) {
      console.log(
        "[cron/cocoiru] sweep emitted=%d skipped_active=%d skipped_no_match=%d scanned=%d",
        result.emitted,
        result.skippedAlreadyActive,
        result.skippedNoMatch,
        result.scanned,
      );
    }
  } catch (err) {
    console.error("[cron/cocoiru] sweep failed:", err);
  }
}

/**
 * 定期 sweep を起動する。サーバ起動後 1 回呼ぶ想定。
 * 既に起動済みなら no-op。process exit 時は GC が timer を回収するので
 * 明示停止は不要だが、テスト用に stop 関数も export する。
 */
export function startCocoiruScheduleSweep(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, SWEEP_INTERVAL_MS);
  // Node.js の event loop を sweep だけのために生かさないよう unref
  // (HTTP サーバが停止したら sweep も自然停止する)
  if (typeof timer.unref === "function") timer.unref();
  console.log("[cron/cocoiru] schedule sweep started (interval=%dms)", SWEEP_INTERVAL_MS);
}

/** テスト・hot-reload 用。 */
export function stopCocoiruScheduleSweep(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** テスト用: 既存の timer を無視して 1 度だけ手動 tick する。 */
export async function runCocoiruScheduleSweepOnce(): Promise<void> {
  await tick();
}
