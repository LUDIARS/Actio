/**
 * Cc チーム同期 (spec/feature/team-task/spec.md §8.2)
 *
 * Concordia `GET /v1/teams` を起動時 + 10 分 tick で読み、`team_refs` へ upsert する。
 * - Cc 由来フィールド (id / slug / name / cc_settings) は読み取り専用の同期対象。
 * - Actio 固有 `settings` は上書きしない (新規行だけ defaultTeamSettings() で初期化)。
 * - CONCORDIA_URL 未設定は同期 skip + 警告ログ (無言 fallback 禁止)。
 * - Cc 不達時は既存キャッシュのまま続行し、リトライは次 tick に任せる。
 */

import { secretManager } from "../../../src/config/secrets.js";
import { teamRefRepo } from "../../../src/db/repository.js";
import { defaultTeamSettings } from "./settings.js";

export interface CcTeam {
  id: string;
  slug: string;
  name: string;
  ccSettings: Record<string, unknown>;
}

const TEAM_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const TEAM_SYNC_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRepoIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((repoId): repoId is string =>
    typeof repoId === "string"
      && repoId.length > 0
      && repoId.length <= 128
      && !/[\\/\0\r\n]/.test(repoId),
  );
}

/** Cc `GET /v1/teams` の応答からチーム配列を取り出す (形が崩れていれば null)。 */
export function parseCcTeams(payload: unknown): CcTeam[] | null {
  if (!isRecord(payload)) return null;
  const teams = (payload as { teams?: unknown }).teams;
  if (!Array.isArray(teams)) return null;
  const parsed: CcTeam[] = [];
  for (const raw of teams) {
    if (!isRecord(raw)) return null;
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== "string" || t.id.length === 0
      || typeof t.slug !== "string" || t.slug.length === 0
      || typeof t.name !== "string" || t.name.length === 0) return null;
    if (t.settings !== undefined && !isRecord(t.settings)) return null;
    const safeSettings: Record<string, unknown> = { ...(t.settings ?? {}) as Record<string, unknown> };
    const settingsRepoIds = safeSettings.repo_ids;
    delete safeSettings.repos;
    delete safeSettings.repo_ids;
    const repoIds = parseRepoIds(t.repo_ids ?? settingsRepoIds);
    // Repository URLs/paths are intentionally discarded; only opaque catalog IDs may be cached.
    parsed.push({ id: t.id, slug: t.slug, name: t.name, ccSettings: { ...safeSettings, repo_ids: repoIds } });
  }
  return parsed;
}

export type TeamSyncResult =
  | { ok: true; synced: number }
  | { ok: false; reason: "unconfigured" | "unreachable" | "malformed" | "persistence" };

/** 1 回分の同期。失敗しても throw しない (呼び出し元 tick を殺さない)。 */
export async function syncTeamsFromCc(
  fetchImpl: typeof fetch = fetch,
): Promise<TeamSyncResult> {
  const baseUrl = secretManager.getOrDefault("CONCORDIA_URL", "").replace(/\/+$/, "");
  if (!baseUrl) {
    console.warn("[team-sync] CONCORDIA_URL が未設定のためチーム同期を skip します");
    return { ok: false, reason: "unconfigured" };
  }
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/teams`, { signal: AbortSignal.timeout(TEAM_SYNC_TIMEOUT_MS) });
  } catch {
    // Do not include the configured URL or nested network error: either may contain credentials.
    console.warn("[team-sync] Cc へ到達できません。既存キャッシュで続行します");
    return { ok: false, reason: "unreachable" };
  }
  if (!response.ok) {
    console.warn(`[team-sync] Cc が HTTP ${response.status} を返しました。既存キャッシュで続行します`);
    return { ok: false, reason: "unreachable" };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    console.warn("[team-sync] Cc /v1/teams の応答が JSON ではないため同期を skip します");
    return { ok: false, reason: "malformed" };
  }
  const teams = parseCcTeams(payload);
  if (teams === null) {
    console.warn("[team-sync] Cc /v1/teams の応答形が想定外のため同期を skip します");
    return { ok: false, reason: "malformed" };
  }
  const now = new Date();
  try {
    for (const team of teams) {
      await teamRefRepo.upsertFromCc(
        { id: team.id, slug: team.slug, name: team.name, ccSettings: team.ccSettings, syncedAt: now },
        defaultTeamSettings() as unknown as Record<string, unknown>,
      );
    }
  } catch {
    console.warn("[team-sync] チームキャッシュの保存に失敗しました。次回 tick で再試行します");
    return { ok: false, reason: "persistence" };
  }
  return { ok: true, synced: teams.length };
}

/**
 * 起動時 + 10 分間隔の同期 tick を開始する。停止関数を返す。
 * テスト / SIM 実行では呼ばないことで無効化する (呼び出しは起動経路 1 箇所のみ)。
 */
export function startTeamSyncTick(intervalMs: number = TEAM_SYNC_INTERVAL_MS): () => void {
  let isRunning = false;
  const runOnce = async (): Promise<void> => {
    if (isRunning) return;
    isRunning = true;
    try {
      await syncTeamsFromCc();
    } catch {
      // Last-resort containment: a scheduler tick must never become an unhandled rejection.
      console.warn("[team-sync] 予期しない同期エラーを隔離しました。次回 tick で再試行します");
    } finally {
      isRunning = false;
    }
  };
  void runOnce();
  const timer = setInterval(() => void runOnce(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
