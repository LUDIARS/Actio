import type { BacklogTask } from "./contracts.js";

function terms(title: string): Set<string> {
  const normalized = title.normalize("NFKC").toLowerCase().replace(/\[[^\]]*\]/g, " ");
  const words = normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? [];
  return new Set(words.flatMap(word => /^[a-z0-9]+$/.test(word) ? [word] : Array.from(word).slice(1).map((_, i) => word.slice(i, i + 2))));
}

/** Explainable lexical candidates; grouping is always a human decision. */
export function suggestGroups(tasks: BacklogTask[]): { ids: string[]; reason: string }[] {
  const open = tasks.filter(t => !["done", "cancelled"].includes(t.status));
  const tokens = new Map(open.map(t => [t.id, terms(t.title)]));
  const result: { ids: string[]; reason: string }[] = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j];
      if (a.projectId !== b.projectId || (a.groupId && a.groupId === b.groupId)) continue;
      const left = tokens.get(a.id)!, right = tokens.get(b.id)!;
      const shared = [...left].filter(t => right.has(t));
      const union = new Set([...left, ...right]).size;
      if (shared.length >= 2 && union > 0 && shared.length / union >= 0.5) {
        result.push({ ids: [a.id, b.id], reason: `タイトルの共通語: ${shared.slice(0, 5).join("、")}` });
        if (result.length === 20) return result;
      }
    }
  }
  return result;
}
