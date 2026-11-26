#include "backlog_plan.hpp"
#include <set>
#include <string>
#include "planning_lock.hpp"
#include "write_input.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:d06a063c */
#include "../../contracts/sprint_history_contract.hpp" /* augur-inject:contract-predicate:17f5bfc5 */
#include "../../contracts/backlog_ungroup_contract.hpp" /* augur-inject:contract-predicate:d1e94bc1 */
#include "../../contracts/backlog_order_contract.hpp" /* augur-inject:contract-predicate:07c00c9b */

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

constexpr std::size_t max_order_items = 5000;

Json text(const std::optional<std::string>& field) {
    return field ? Json(*field) : Json();
}
}

Json readSprintHistory(DbConnection& connection, DbDeadline deadline, std::string_view team,
                       std::string_view sprint) { return ::augur::invoke_observed(::augur::ContractSpec{"C-46", "1f8725af", "src/db/backlog_plan.cpp:21"}, actio::contracts::sprint_history, [&]() -> Json { /* augur-inject:contract-wrap:1f8725af */
    if (sprint.contains('\0')
        || connection.query({"SELECT 1 FROM sprints WHERE team_id = $1 AND id = $2", {team, sprint}, 1}, deadline).empty())
        throw WriteError("スプリントが見つかりません", 404);
    // The connection layer's row cap bounds the audit trail returned in one response.
    const auto rows = connection.query({R"sql(
        SELECT kind, actor_id, reason, before_json, after_json, created_at FROM sprint_changes
        WHERE sprint_id = $1 ORDER BY created_at, event_order
        )sql", {sprint}, portus::db_max_rows}, deadline);
    auto changes = Json::array();
    for (const auto& row : rows) {
        changes.push_back(Json::object({
            {"kind", text(row.at(0))}, {"actorId", text(row.at(1))}, {"reason", text(row.at(2))},
            {"beforeJson", text(row.at(3))}, {"afterJson", text(row.at(4))}, {"createdAt", text(row.at(5))}}));
    }
    return Json::object({{"changes", std::move(changes)}});
}, connection, deadline, team, sprint); /* augur-inject:contract-end:1f8725af */ }

Json ungroupBacklog(DbConnection& connection, DbDeadline deadline, std::string_view team, std::string_view group) { return ::augur::invoke_observed(::augur::ContractSpec{"C-47", "f241cf5c", "src/db/backlog_plan.cpp:40"}, actio::contracts::backlog_ungroup, [&]() -> Json { /* augur-inject:contract-wrap:f241cf5c */
    return inWriteTransaction(connection, deadline, [&] {
        lockTeamPlan(connection, deadline, team);
        if (group.contains('\0')
            || connection.query({"SELECT id FROM backlog_groups WHERE id = $1 AND team_id = $2", {group, team}, 1},
                                deadline).empty())
            throw WriteError("グループが見つかりません", 404);
        connection.query({"UPDATE backlog_placements SET group_id = NULL WHERE group_id = $1", {group}, 0}, deadline);
        connection.query({"DELETE FROM backlog_groups WHERE id = $1 AND team_id = $2", {group, team}, 0}, deadline);
        return Json::object({{"ok", true}});
    });
}, connection, deadline, team, group); /* augur-inject:contract-end:f241cf5c */ }

void validateBacklogOrder(const Json& input) {
    if (!input.is_object() || !input.find("taskIds") || !input.at("taskIds").is_array())
        throw WriteError("taskIds must be an array");
    if (input.members().size() != 1) throw WriteError("Unrecognized key(s) in object");
    const auto& ids = input.at("taskIds").items();
    if (ids.size() > max_order_items) throw WriteError("taskIds must contain at most 5000 items");
    std::set<std::string, std::less<>> seen;
    for (const auto& id : ids) {
        if (!validString(id) || id.as_string().empty()) throw WriteError("taskIds must contain non-empty strings");
        if (!seen.insert(id.as_string()).second) throw WriteError("タスクが重複しています");
    }
}

Json reorderBacklog(DbConnection& connection, DbDeadline deadline, std::string_view team, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-48", "daa285a2", "src/db/backlog_plan.cpp:66"}, actio::contracts::backlog_order, [&]() -> Json { /* augur-inject:contract-wrap:daa285a2 */
    validateBacklogOrder(input);
    const auto ids = input.at("taskIds").dump();
    const auto submitted = std::to_string(input.at("taskIds").items().size());
    return inWriteTransaction(connection, deadline, [&] {
        lockTeamPlan(connection, deadline, team);
        lockTaskWrites(connection, deadline);
        // Lock the team's backlog rows, then compare the set in SQL so large backlogs stay within the row cap.
        const auto counts = connection.query({R"sql(
            WITH locked AS (SELECT id FROM tasks WHERE team_id = $1 AND lane = 'backlog' FOR UPDATE)
            SELECT count(*)::text,
                count(*) FILTER (WHERE id IN (SELECT jsonb_array_elements_text($2::jsonb)))::text
            FROM locked
            )sql", {team, ids}, 1}, deadline);
        const auto& row = counts.at(0);
        if (row.at(0) != submitted || row.at(1) != submitted)
            throw WriteError("バックログが変更されています。再読み込みしてください", 409);
        connection.query({R"sql(
            INSERT INTO backlog_placements(task_id, position)
            SELECT value, (ordinality - 1)::integer FROM jsonb_array_elements_text($1::jsonb) WITH ORDINALITY
            ON CONFLICT(task_id) DO UPDATE SET position = excluded.position
            )sql", {ids}, 0}, deadline);
        return Json::object({{"ok", true}});
    });
}, connection, deadline, team, input); /* augur-inject:contract-end:daa285a2 */ }
}
