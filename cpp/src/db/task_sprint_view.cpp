#include "task_read.hpp"
#include "sprint_projection.hpp"
#include "task_projection.hpp"
#include "task_read_sql.hpp"

namespace actio {
namespace {
portus::Json activeSprint(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view team) {
    const auto sql = "SELECT " + std::string(sprintDocument)
        + " FROM sprints WHERE team_id = $1 AND status = 'active' ORDER BY starts_on, id LIMIT 1";
    const auto rows = connection.query({sql, {team}, 1}, deadline);
    return rows.empty() ? portus::Json() : portus::Json::parse(rows.front().at(0).value());
}
}

portus::Json readCurrentSprintTasks(portus::DbConnection& connection, portus::DbDeadline deadline,
                                   const TaskListQuery& input) {
    auto sprint = activeSprint(connection, deadline, input.team);
    TaskReadSql sql{"SELECT " + taskDocument(TaskProjection::full) + " FROM tasks WHERE TRUE", {}};
    addTaskFilters(sql, input);
    sql.text += " AND (";
    if (!sprint.is_null()) sql.text += "sprint_id = " + sql.bind(sprint.at("id").as_string()) + " OR ";
    sql.text += "(lane = 'backlog' AND sprint_id IS NULL AND status NOT IN ('done', 'cancelled')))";
    sql.text += " ORDER BY ";
    sql.text += input.sort == TaskSort::personal ? taskPageOrder(TaskSort::personal) : "created_at DESC";

    auto tasks = portus::Json::array();
    for (const auto& row : sql.query(connection, deadline, portus::db_max_rows))
        tasks.push_back(portus::Json::parse(row.at(0).value()));
    return portus::Json::object({{"tasks", std::move(tasks)}, {"current_sprint", std::move(sprint)}});
}
}
