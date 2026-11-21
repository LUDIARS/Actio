// @spec 自律スプリントの遮断と復旧
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:366c7e65 */
import augurContract_80027ab4 from '../../../contracts/autonomous-sprint-breaker.contract.ts'; /* augur-inject:contract-predicate:d4e78e2b */
export type BreakerVerdict = "allowed" | "open" | "unavailable";

export function interpretBreakerStatus(status: number | null): BreakerVerdict {
  if (status === 200) return "allowed";
  return status === 409 ? "open" : "unavailable";
}
// @ts-expect-error augur-inject
interpretBreakerStatus = contract(interpretBreakerStatus, { ...augurContract_80027ab4, contractId: 'C-22', mode: 'observe', sample: 1, where: 'modules/task/autonomous-sprint/breaker.ts:3', rule: 'contract-wrap', id: '80027ab4' }); /* augur-inject:contract-wrap:80027ab4 */

export async function checkSprintBreaker(
  endpoint: string | undefined,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<BreakerVerdict> {
  if (!endpoint) return interpretBreakerStatus(null);
  try {
    const url = new URL("/v1/autonomous-loop/circuit-breaker/check", endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return interpretBreakerStatus(null);
    }
    const timeout = AbortSignal.timeout(5000);
    const response = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "actio_sprint" }),
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const result = interpretBreakerStatus(response.status);
    await response.body?.cancel();
    return result;
  } catch {
    // Transport failure is explicitly persisted as unavailable by the caller.
    return interpretBreakerStatus(null);
  }
}
