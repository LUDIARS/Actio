// Contract for parsePublicReports (C-14). Parsed reports carry only the public
// fields of spec §8; raw text, intake channel, platform ids and triage reasons never pass.
const ALLOWED = new Set([
  "reportId", "title", "summary", "severity", "status", "publicName", "rewardTokens", "receivedAt", "deployedAt",
]);

export default {
  post: (result: Array<Record<string, unknown>> | null): true | string => {
    if (result === null) return true;
    for (const report of result) {
      const extra = Object.keys(report).filter((key) => !ALLOWED.has(key));
      if (extra.length > 0) return `non-public fields leaked: ${extra.join(", ")}`;
      if (typeof report.reportId !== "string" || report.reportId.length === 0) return "reportId is required";
    }
    return true;
  },
};
