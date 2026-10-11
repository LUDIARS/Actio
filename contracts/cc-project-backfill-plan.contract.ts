type Task = { id: string; projectId: string | null; teamId: string | null; sprintId: string | null };
type Project = { code: string; teamIds: string[] };
type Rename = { from: string; to: string };
type Plan = {
  renames: { taskId: string; from: string; to: string }[];
  teamBindings: { taskId: string; projectId: string; teamId: string }[];
  multiTeam: { taskId: string; projectId: string; teamIds: string[] }[];
};

export default {
  post(plan: Plan, tasks: Task[], projects: Project[], renames: Rename[]): true | string {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const teams = new Map(projects.map((project) => [project.code, project.teamIds]));
    const renameTo = new Map(renames.map((rename) => [rename.from, rename.to]));
    for (const row of plan.renames) {
      if (byId.get(row.taskId)?.projectId !== row.from || renameTo.get(row.from) !== row.to) return "rename rows must follow the given map";
    }
    for (const row of plan.teamBindings) {
      const task = byId.get(row.taskId);
      if (!task || task.teamId !== null || task.sprintId !== null) return "only team-less tasks outside sprints may be bound";
      if (JSON.stringify(teams.get(row.projectId)) !== JSON.stringify([row.teamId])) return "auto binding needs exactly one team";
    }
    return plan.multiTeam.every((row) => (teams.get(row.projectId)?.length ?? 0) > 1)
      || "multi-team rows are only for projects with several teams";
  },
};
