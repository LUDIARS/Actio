// Contract for isAllowedHost (C-10). Loopback names are always accepted and an
// unknown public host is refused unless it was configured, as vite preview did.
export default {
  post: (result: boolean, host: string | undefined, allowed: readonly string[]): true | string => {
    if (!host) return result === false || "missing Host header must be refused";
    const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
    if (name === "localhost" || name === "127.0.0.1" || name === "::1") {
      return result === true || "loopback host must be accepted";
    }
    if (allowed.map((h) => h.toLowerCase()).includes(name)) return result === true || "configured host must be accepted";
    return true;
  },
};
