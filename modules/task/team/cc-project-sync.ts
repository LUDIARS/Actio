/**
 * Cc プロジェクト同期 (spec/feature/task-integration/spec.md §6.1)
 *
 * チーム同期と同じ tick で Cc `GET /v1/project-codes/admin` を読み、 `project_refs` へ upsert する。
 * - 保存するのは code / name / team_ids だけ。 repo_origin / repo_path は保存しない。
 * - Cc から消えた code は削除せず removed_at を付ける (既存タスクの参照を壊さない)。
 * - CONCORDIA_URL 未設定は skip + 警告ログ、 Cc 不達はキャッシュのまま続行する (チーム同期と同じ扱い)。
 */

import { secretManager } from "../../../src/config/secrets.js";
import { projectRefRepo } from "../../../src/db/repository.js";
import { parseCcProjects } from "./cc-project-parse.js";

const PROJECT_SYNC_TIMEOUT_MS = 10_000;

export type ProjectSyncResult =
  | { ok: true; synced: number }
  | { ok: false; reason: "unconfigured" | "unreachable" | "malformed" | "persistence" };

export async function syncProjectsFromCc(fetchImpl: typeof fetch = fetch): Promise<ProjectSyncResult> {
  const baseUrl = secretManager.getOrDefault("CONCORDIA_URL", "").replace(/\/+$/, "");
  if (!baseUrl) {
    console.warn("[project-sync] CONCORDIA_URL が未設定のためプロジェクト同期を skip します");
    return { ok: false, reason: "unconfigured" };
  }
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/project-codes/admin`, { signal: AbortSignal.timeout(PROJECT_SYNC_TIMEOUT_MS) });
  } catch {
    // Do not include the configured URL or nested network error: either may contain credentials.
    console.warn("[project-sync] Cc へ到達できません。既存キャッシュで続行します");
    return { ok: false, reason: "unreachable" };
  }
  if (!response.ok) {
    console.warn(`[project-sync] Cc が HTTP ${response.status} を返しました。既存キャッシュで続行します`);
    return { ok: false, reason: "unreachable" };
  }
  const projects = parseCcProjects(await response.json().catch(() => null));
  if (projects === null) {
    console.warn("[project-sync] Cc /v1/project-codes/admin の応答形が想定外のため同期を skip します");
    return { ok: false, reason: "malformed" };
  }
  const now = new Date();
  try {
    for (const project of projects) {
      await projectRefRepo.upsertFromCc({ code: project.code, name: project.name, teamIds: project.teamIds, syncedAt: now });
    }
    await projectRefRepo.markRemovedExcept(projects.map((project) => project.code), now);
  } catch {
    console.warn("[project-sync] プロジェクトキャッシュの保存に失敗しました。次回 tick で再試行します");
    return { ok: false, reason: "persistence" };
  }
  return { ok: true, synced: projects.length };
}
