/**
 * タスクの作業者種別 (人間 / AI) の読み取りと検証 (純粋関数)。
 * spec/feature/task-integration/spec.md §4
 *
 * creator_type は「だれが登録したか」、 executor_type は「だれが作業するか」。 混ぜない。
 */

export const EXECUTOR_TYPES = ["human", "ai"] as const;
export type ExecutorType = (typeof EXECUTOR_TYPES)[number];

const AI_EXECUTOR_PATTERN = /^[A-Za-z0-9._:/@-]{1,128}$/;

export interface ExecutorRequestFields {
  executorType: unknown;
  aiExecutor: unknown;
}

export interface ExecutorValue {
  executorType: ExecutorType;
  aiExecutor: string | null;
}

/** camelCase / snake_case のどちらでも受ける。 渡されなかった項目は undefined。 */
export function readExecutorFields(body: Record<string, unknown>): ExecutorRequestFields {
  return {
    executorType: body.executorType !== undefined ? body.executorType : body.executor_type,
    aiExecutor: body.aiExecutor !== undefined ? body.aiExecutor : body.ai_executor,
  };
}

export function isExecutorType(value: unknown): value is ExecutorType {
  return typeof value === "string" && (EXECUTOR_TYPES as readonly string[]).includes(value);
}

/**
 * 現在値 (新規作成なら null) と入力から次の値を決める。
 * - human に指定した ai_executor は受け付けない (400)
 * - human へ戻したら ai_executor を消す
 * - ai で ai_executor を省略したら、 もともと ai なら現在値を保つ
 */
export function resolveExecutor(
  current: ExecutorValue | null,
  input: ExecutorRequestFields,
): { value: ExecutorValue; error?: string } {
  const fallback: ExecutorValue = current ?? { executorType: "human", aiExecutor: null };
  if (input.executorType !== undefined && !isExecutorType(input.executorType)) {
    return { value: fallback, error: "executor_type must be human or ai" };
  }
  if (input.aiExecutor !== undefined && input.aiExecutor !== null
    && (typeof input.aiExecutor !== "string" || !AI_EXECUTOR_PATTERN.test(input.aiExecutor))) {
    return { value: fallback, error: "ai_executor must be 1-128 characters of letters, digits, '.', '_', ':', '/', '@' or '-'" };
  }
  const executorType: ExecutorType = input.executorType !== undefined ? input.executorType as ExecutorType : fallback.executorType;
  if (executorType === "human") {
    if (typeof input.aiExecutor === "string") return { value: fallback, error: "ai_executor is only allowed when executor_type is ai" };
    return { value: { executorType, aiExecutor: null } };
  }
  if (input.aiExecutor !== undefined) return { value: { executorType, aiExecutor: input.aiExecutor as string | null } };
  return { value: { executorType, aiExecutor: fallback.executorType === "ai" ? fallback.aiExecutor : null } };
}
