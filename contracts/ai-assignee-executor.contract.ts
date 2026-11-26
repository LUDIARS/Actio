// Contract for alignExecutorWithAssignee (C-46). A task whose assignee is an AI member
// (`ai:<call_name>`) is either rejected or ends up as executor_type=ai / ai_executor=call_name.
type Executor = { executorType: string; aiExecutor: string | null };
type Input = { assigneeId: string | null; requested: { executorType: unknown; aiExecutor: unknown } };

export default {
  post: (result: { value: Executor; error?: string }, input: Input): true | string => {
    const callName = typeof input.assigneeId === "string" && input.assigneeId.startsWith("ai:") ? input.assigneeId.slice(3) : null;
    if (callName === null || callName === "") return true;
    const conflicting = input.requested.executorType === "human"
      || (typeof input.requested.aiExecutor === "string" && input.requested.aiExecutor !== callName);
    if (conflicting) return result.error !== undefined || "a conflicting executor must be rejected for an AI assignee";
    if (result.error !== undefined) return "a non-conflicting request must not be rejected";
    return (result.value.executorType === "ai" && result.value.aiExecutor === callName)
      || `executor must be ai/${callName} for an AI assignee`;
  },
};
