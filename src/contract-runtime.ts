/**
 * Actio's Augur `contract-wrap` runtime. Keep the wrapper and weaver JSONL
 * protocol compatible with Augur. Actio owns the async logging implementation.
 * @implements AT-TASK-LIST-STALL
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createContractLogBuffer } from "./contract-log-buffer.js";
import { createContractLogWriter } from "./contract-log-files.js";

export type ContractVerdict = true | string | undefined;

export interface ContractSpec<A extends unknown[], R> {
  pre?: (...args: A) => ContractVerdict;
  post?: (result: Awaited<R>, ...args: A) => ContractVerdict;
  contractId: string;
  id: string;
  where: string;
  sample?: number;
}

const RETENTION_ENV = "AUGUR_CONTRACT_LOG_RETENTION_DAYS";
const DEFAULT_RETENTION_DAYS = 7;

function retentionDays(): number {
  const raw = process.env[RETENTION_ENV];
  const parsed = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

const writeBatch = createContractLogWriter(randomUUID());
const log = createContractLogBuffer((lines) => {
  const directory = process.env.VESTIGIUM_LOGS_DIR || join(process.cwd(), "logs");
  return writeBatch(directory, retentionDays(), lines);
}, { batchSize: 128, delayMs: 250, maxPending: 4096 });

export function flushContractLogs(): Promise<void> {
  return log.flush();
}

process.on("beforeExit", () => void flushContractLogs());

function record(message: string, context: Record<string, string>): void {
  try {
    log.enqueue(`${JSON.stringify({ time: new Date().toISOString(), msg: message, ctx: context })}\n`);
  } catch {
    // Observation must never change the wrapped operation.
  }
}

function failure(verdict: ContractVerdict): string | null {
  if (verdict === true || verdict === undefined) return null;
  return typeof verdict === "string" ? verdict : "predicate failed";
}

export function contract<A extends unknown[], R>(
  fn: (...args: A) => R,
  spec: ContractSpec<A, R>,
): (...args: A) => R {
  const { pre, post, contractId, id, where, sample } = spec;
  const rate = typeof sample === "number" && sample > 0 && sample < 1 ? sample : 1;
  return function contracted(this: unknown, ...args: A): R {
    const context = { contract: contractId, id, where, observed_at: new Date().toISOString() };
    let preReason: string | null = null;
    try {
      preReason = failure(pre?.(...args));
    } catch {
      record("contract predicate threw", { ...context, phase: "pre", reason: "pre predicate threw" });
    }
    if (preReason) record("contract violated", { ...context, phase: "pre", reason: preReason });

    const observe = (result: Awaited<R>): void => {
      try {
        const postReason = failure(post?.(result, ...args));
        if (postReason) record("contract violated", { ...context, phase: "post", reason: postReason });
        else if (!preReason && (rate === 1 || Math.random() < rate)) {
          record("contract observed", { ...context, phase: "ok" });
        }
      } catch {
        record("contract predicate threw", { ...context, phase: "post", reason: "post predicate threw" });
      }
    };

    const result = fn.apply(this, args);
    if (result instanceof Promise) {
      return result.then((value: Awaited<R>) => {
        observe(value);
        return value;
      }) as R;
    }
    observe(result as Awaited<R>);
    return result;
  };
}
