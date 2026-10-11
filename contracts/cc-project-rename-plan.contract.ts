type Project = { code: string; renamedFrom: string[] };
type Rename = { from: string; to: string };

export default {
  post(result: Rename[], projects: Project[]): true | string {
    const live = new Set(projects.map((project) => project.code));
    if (result.some((rename) => live.has(rename.from))) return "a code still registered in Cc must not be reassigned";
    const owner = new Map<string, string>();
    for (const project of projects) {
      for (const from of project.renamedFrom) if (!live.has(from) && !owner.has(from)) owner.set(from, project.code);
    }
    const expected = [...owner].map(([from, to]) => `${from}>${to}`);
    const actual = result.map((rename) => `${rename.from}>${rename.to}`);
    return JSON.stringify(expected.sort()) === JSON.stringify([...actual].sort())
      || "every retired renamed_from code must map to its first claiming code exactly once";
  },
};
