function readCode(value: unknown): unknown {
  return (value as { code?: unknown } | null | undefined)?.code;
}

export default {
  post: (status: 503 | undefined, error: unknown): true | string => {
    const retryable = readCode(error) === "57014"
      || (error instanceof Error && (
        error.name === "TaskListLoadTimeoutError" || readCode(error.cause) === "57014"
      ));
    return status === (retryable ? 503 : undefined) || "unexpected task list timeout status";
  },
};
