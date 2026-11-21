import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:11d6dc1e */
import augurContract_8f9ffe37 from '../../../contracts/autonomous-sprint-access.contract.ts'; /* augur-inject:contract-predicate:fcabd1aa */
export const AUTONOMOUS_SPRINT_SCOPE = "autonomous-sprint";

export function ownsLoop(clientId: string | undefined, boundClientId: string): boolean {
  return !!clientId && clientId === boundClientId;
}
// @ts-expect-error augur-inject
ownsLoop = contract(ownsLoop, { ...augurContract_8f9ffe37, contractId: 'C-24', mode: 'observe', sample: 1, where: 'modules/task/autonomous-sprint/access.ts:3', rule: 'contract-wrap', id: '8f9ffe37' }); /* augur-inject:contract-wrap:8f9ffe37 */
