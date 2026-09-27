// @implements AT-SPRINT-CHAT-INTEGRATION
/** Only an explicit leading command opens an intake; quoted commands are ordinary discussion. */
export function backlogCommand(content: string): string | null {
  const match = content.trimStart().match(/^(?:\+\+バックログ追加|\/backlog\s+add|\/actio\s+backlog)(?=$|\s|[：:])(?:[：:]?\s*)([\s\S]*)$/u);
  return match ? match[1].trim() : null;
}

/** Bot command registration may normalize a real slash invocation to the same parser. */
export function isBotCommand(content: string): boolean {
  return /^(?:\+\+|\/actio\b|\/backlog\b)/u.test(content.trimStart());
}
