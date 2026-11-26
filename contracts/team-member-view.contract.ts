// Contract for toTeamMemberView (C-47). Rows keyed `ai:<call_name>` are AI members and carry
// the call name; every other row is a human member with no call name.
type View = { userId: string; role: string; kind: string; callName: string | null };

export default {
  post: (result: View, row: { userId: string; role: string }): true | string => {
    if (result.userId !== row.userId || result.role !== row.role) return "userId and role must be passed through";
    const callName = row.userId.startsWith("ai:") && row.userId.length > 3 ? row.userId.slice(3) : null;
    if (callName !== null) return (result.kind === "ai" && result.callName === callName) || "ai: rows must be kind=ai with callName";
    return (result.kind === "human" && result.callName === null) || "other rows must be kind=human without callName";
  },
};
