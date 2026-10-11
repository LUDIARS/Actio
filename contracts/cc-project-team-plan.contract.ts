type Project = { code: string; teamIds: string[] };
type Binding = { code: string; teamId: string };

function sameTeams(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

export default {
  post(result: Binding[], projects: Project[], previous: Map<string, string[]>): true | string {
    const expected = projects
      .filter((project) => project.teamIds.length === 1)
      .filter((project) => !sameTeams(previous.get(project.code) ?? [], project.teamIds))
      .map((project) => `${project.code}>${project.teamIds[0]}`);
    const actual = result.map((binding) => `${binding.code}>${binding.teamId}`);
    return JSON.stringify(expected.sort()) === JSON.stringify(actual.sort())
      || "only projects whose team_ids changed to exactly one team may bind team-less tasks";
  },
};
