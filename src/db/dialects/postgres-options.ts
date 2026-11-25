import type postgres from "postgres";
import { contract } from '../../contract-runtime.js'; /* augur-inject:import:d5a0d616 */
import augurContract_86c46e4c from '../../../contracts/postgres-options.contract.ts'; /* augur-inject:contract-predicate:9ad35d11 */

export function postgresOptions(): postgres.Options<Record<string, never>> {
  return {
    connect_timeout: 10,
    max: 10,
    idle_timeout: 30,
    keep_alive: 15,
    connection: { statement_timeout: 7_000 },
  };
}
// @ts-expect-error augur-inject
postgresOptions = contract(postgresOptions, { ...augurContract_86c46e4c, contractId: 'C-26', mode: 'observe', sample: 1, where: 'src/db/dialects/postgres-options.ts:3', rule: 'contract-wrap', id: '86c46e4c' }); /* augur-inject:contract-wrap:86c46e4c */
