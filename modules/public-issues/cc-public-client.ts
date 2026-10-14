/**
 * Cc の公開読み出し API のクライアント (spec/feature/public-issues.md §5、 Cc bug-bounty.md §8)。
 * - `GET /v1/projects/public-issues` … 公開プロジェクトのコード一覧
 * - `GET /v1/bounty/public-reports?project=<code>` … 採用済みで公開してよい報告
 * 成功した読み取りだけを 60 秒までメモリに持つ。 届かない・形が違うときは null (古い内容を成功として返さない)。
 */
import { secretManager } from "../../src/config/secrets.js";
import { parsePublicProjectCodes, parsePublicReports } from "./cc-public-parse.js";
import { createTtlCache, PUBLIC_CACHE_TTL_MS } from "./ttl-cache.js";
import type { PublicBountyReport } from "./types.js";

const CC_TIMEOUT_MS = 5_000;

export interface CcPublicClient {
  publicProjectCodes(): Promise<string[] | null>;
  publicReports(projectCode: string): Promise<PublicBountyReport[] | null>;
}

export interface CcPublicClientOptions {
  baseUrl?: () => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
}

function configuredBaseUrl(): string {
  return secretManager.getOrDefault("CONCORDIA_URL", "").replace(/\/+$/, "");
}

export function createCcPublicClient(options: CcPublicClientOptions = {}): CcPublicClient {
  const baseUrl = options.baseUrl ?? configuredBaseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const ttlMs = options.ttlMs ?? PUBLIC_CACHE_TTL_MS;
  const projectCache = createTtlCache<string[]>(ttlMs, options.now);
  const reportCache = createTtlCache<PublicBountyReport[]>(ttlMs, options.now);

  async function readJson(path: string): Promise<unknown> {
    const base = baseUrl();
    if (!base) return undefined;
    try {
      const response = await fetchImpl(`${base}${path}`, { signal: AbortSignal.timeout(CC_TIMEOUT_MS) });
      if (!response.ok) {
        console.warn(`[public-issues] Cc が HTTP ${response.status} を返しました`);
        return undefined;
      }
      return await response.json();
    } catch {
      // Do not log the URL or nested error: either may carry credentials.
      console.warn("[public-issues] Cc へ到達できません");
      return undefined;
    }
  }

  return {
    async publicProjectCodes() {
      const cached = projectCache.get("projects");
      if (cached) return cached;
      const codes = parsePublicProjectCodes(await readJson("/v1/projects/public-issues"));
      if (codes) projectCache.set("projects", codes);
      return codes;
    },
    async publicReports(projectCode) {
      const cached = reportCache.get(projectCode);
      if (cached) return cached;
      const reports = parsePublicReports(await readJson(`/v1/bounty/public-reports?project=${encodeURIComponent(projectCode)}`));
      if (reports) reportCache.set(projectCode, reports);
      return reports;
    },
  };
}
