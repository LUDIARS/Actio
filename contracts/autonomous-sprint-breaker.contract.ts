export default {
  post(result: string, status: number | null): true | string {
    if (result === "allowed") return status === 200 || "Only HTTP 200 authorizes a trigger";
    if (result === "open") return status === 409 || "Only HTTP 409 indicates OPEN";
    return (result === "unavailable" && status !== 200 && status !== 409) || "Non-authoritative checks must defer";
  },
};
