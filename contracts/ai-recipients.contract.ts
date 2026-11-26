// Contract for routeAiRecipients (C-49). A notification addressed only to AI members is not
// delivered and carries a reason; otherwise it is delivered to the remaining human recipients.
type Route = { deliver: boolean; recipientIds: string[]; skippedAiIds: string[]; reason: string | null };

export default {
  post: (result: Route, intent: { recipientIds: string[] }): true | string => {
    const ai = intent.recipientIds.filter((id) => id.startsWith("ai:"));
    const humans = intent.recipientIds.filter((id) => !id.startsWith("ai:"));
    if (result.recipientIds.some((id) => id.startsWith("ai:"))) return "AI members must be removed from recipients";
    if (result.recipientIds.length !== humans.length || result.skippedAiIds.length !== ai.length) return "recipients must be split into humans and AI members";
    if (ai.length > 0 && humans.length === 0) {
      return (!result.deliver && typeof result.reason === "string" && result.reason.length > 0) || "an AI-only notification must be skipped with a reason";
    }
    return result.deliver || "a notification with human or no recipients must be delivered";
  },
};
