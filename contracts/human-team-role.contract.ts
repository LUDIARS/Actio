// Contract for humanTeamRole (C-48). An AI member never receives a team role that grants
// human decisions, whatever role its row carries; humans keep their stored role.
export default {
  post: (result: string | undefined, userId: string, role: string | undefined): true | string => {
    if (userId.startsWith("ai:") || role === "ai") return result === undefined || "an AI member must not hold a human team role";
    return result === role || "a human member's role must be passed through";
  },
};
