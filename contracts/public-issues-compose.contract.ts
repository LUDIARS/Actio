// Contract for composeProjectIssues (C-16). Bounty-sourced tasks appear only on
// the bounty rows, and an unreachable Cc marks the bounty section unavailable.
type Input = { reports: unknown[] | null; tasks: Array<{ id: string; source: string | null }> };
type Output = { bounty: { available: boolean }; issues: Array<{ id: string }> };

export default {
  post: (result: Output, input: Input): true | string => {
    if (result.bounty.available !== (input.reports !== null)) return "bounty availability must follow the Cc read";
    const bountyIds = new Set(input.tasks.filter((t) => t.source === "concordia.bounty.v1").map((t) => t.id));
    if (result.issues.some((issue) => bountyIds.has(issue.id))) return "bounty tasks must not be listed twice";
    return true;
  },
};
