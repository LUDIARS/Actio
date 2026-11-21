export default {
  post(result: boolean, status: string, effect: string, breaker: string | null): true | string {
    if (status !== "running") return !result || "A paused loop advanced";
    if (effect === "observe") return result || "Observation required a new-start permit";
    return result === (breaker === "allowed") || "A trigger did not honor the breaker verdict";
  },
};
