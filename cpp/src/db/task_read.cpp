#include "task_read.hpp"
#include "task_projection.hpp"
#include "task_read_sql.hpp"
#include "portus/keyset.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:9de775b2 */
#include "../../contracts/task_page.hpp" /* augur-inject:contract-predicate:a71e0fef */

namespace actio {
portus::Json readTaskPage(portus::DbConnection& connection, portus::DbDeadline deadline,
                          const TaskListQuery& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-32", "71b604c0", "src/db/task_read.cpp:7"}, actio::contracts::task_page, [&]() -> portus::Json { /* augur-inject:contract-wrap:71b604c0 */
    const auto projection = input.includeDescription ? TaskProjection::description : TaskProjection::summary;
    const auto page = portus::read_keyset_page<portus::DbRow>(input.limit, task_page_max, [&](std::size_t count) {
        TaskReadSql sql{"SELECT " + taskDocument(projection) + ", " + taskPageKeys(input.sort)
            + " FROM tasks WHERE TRUE", {}};
        addTaskFilters(sql, input);
        addTaskPageBound(sql, input);
        sql.text += " ORDER BY " + taskPageOrder(input.sort) + " LIMIT " + sql.bind(std::to_string(count));
        return sql.query(connection, deadline, count);
    });
    auto tasks = portus::Json::array();
    for (const auto& row : page.rows) {
        auto task = portus::Json::parse(row.at(0).value());
        tasks.push_back(input.memoria ? memoriaTask(task) : std::move(task));
    }
    auto next = page.has_more ? portus::Json(encodeTaskCursor(page.rows.back(), input.sort)) : portus::Json();
    return portus::Json::object({{input.memoria ? "items" : "tasks", std::move(tasks)},
                                 {"nextCursor", std::move(next)}});
}, connection, deadline, input); /* augur-inject:contract-end:71b604c0 */ }

portus::Json readTaskDetail(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id) {
    const auto sql = "SELECT " + taskDocument(TaskProjection::full) + " FROM tasks WHERE id = $1";
    const auto rows = connection.query({sql, {id}, 1}, deadline);
    return rows.empty() ? portus::Json() : portus::Json::parse(rows.front().at(0).value());
}

bool taskTeamExists(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view team) {
    return !connection.query({"SELECT 1 FROM team_refs WHERE id = $1", {team}, 1}, deadline).empty();
}
}
