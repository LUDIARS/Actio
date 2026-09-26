/**
 * Augur `contract-wrap` の import 先 (augur.contracts.json#importFrom)。
 *
 * 包んだ関数の戻り値・例外をそのまま通し、判定結果だけを weaver 形式の JSONL
 * (`VESTIGIUM_LOGS_DIR` か `<cwd>/logs` の contracts.jsonl) へ書く。
 * 引数や戻り値そのものは記録しない (資格情報を含み得るため)。
 * @implements SPEC-CONTRACT-RUNTIME
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type ContractVerdict = true | string | undefined;

export interface ContractSpec<A extends unknown[], R> {
  pre?: (...args: A) => ContractVerdict;
  post?: (result: Awaited<R>, ...args: A) => ContractVerdict;
  contractId: string;
  id: string;
  where: string;
}

/** @implements SPEC-CONTRACT-RUNTIME */
function record(message: string, context: Record<string, string>): void {
  try {
    const directory = process.env.VESTIGIUM_LOGS_DIR || join(process.cwd(), "logs");
    mkdirSync(directory, { recursive: true });
    appendFileSync(
      join(directory, "contracts.jsonl"),
      `${JSON.stringify({ time: new Date().toISOString(), msg: message, ctx: context })}\n`,
      "utf8",
    );
  } catch {
    // Observation must never change the wrapped operation.
  }
}

/** @implements SPEC-CONTRACT-RUNTIME */
function failure(verdict: ContractVerdict): string | null {
  if (verdict === true || verdict === undefined) return null;
  return typeof verdict === "string" ? verdict : "predicate failed";
}

/** @implements SPEC-CONTRACT-RUNTIME */
export function contract<A extends unknown[], R>(
  fn: (...args: A) => R,
  spec: ContractSpec<A, R>,
): (...args: A) => R {
  const { pre, post, contractId, id, where } = spec;
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
        else if (!preReason) record("contract observed", { ...context, phase: "ok" });
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
