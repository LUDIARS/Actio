type Project = { code: string; name: string; teamIds: string[]; renamedFrom: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** renamed_from は任意項目。 無い・崩れた値は空として扱い、 本体の同期は止めない。 */
function expectedRenames(entry: Record<string, unknown>): string[] {
  const raw = entry.renamed_from;
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  return [...new Set(list.filter((code): code is string =>
    typeof code === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(code) && code !== entry.code))];
}

export default {
  post(result: Project[] | null, payload: unknown): true | string {
    if (result === null) return true;
    if (!isRecord(payload) || !Array.isArray(payload.entries)) return "non-list payload must be rejected";
    const entries: unknown[] = payload.entries;
    if (result.length !== entries.length) return "every entry must be kept";
    return result.every((project, index) => {
      const entry = entries[index] as Record<string, unknown>;
      return project.code === entry.code
        && JSON.stringify(project.renamedFrom) === JSON.stringify(expectedRenames(entry));
    }) || "renamed_from must be optional and exclude the project's own code";
  },
};
