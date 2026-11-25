#include "task_delete.hpp"
#include "actio/local_owner.hpp"
#include "task_critical_path.hpp"
#include "write_input.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:37a752b0 */
#include "../../contracts/task_delete_contract.hpp" /* augur-inject:contract-predicate:d5a463bf */

namespace actio {
portus::Json deleteTask(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id) { return ::augur::invoke_observed(::augur::ContractSpec{"C-38", "e41fe07b", "src/db/task_delete.cpp:8"}, actio::contracts::task_delete, [&]() -> portus::Json { /* augur-inject:contract-wrap:e41fe07b */
    if (id.empty() || id.contains('\0')) throw WriteError("Task not found", 404);
    const auto team = inWriteTransaction(connection, deadline, [&] {
        lockTaskWrites(connection, deadline);
        const auto rows = connection.query({
            "SELECT owner_id, sprint_id, team_id FROM tasks WHERE id = $1 FOR UPDATE", {id}, 1
        }, deadline);
        if (rows.empty()) throw WriteError("Task not found", 404);
        const auto& task = rows.front();
        if (task.at(0) != local_owner_id) throw WriteError("Forbidden", 403);
        if (task.at(1)) throw WriteError("Remove the task from its sprint before deleting it", 409);
        connection.query({"DELETE FROM tasks WHERE id = $1", {id}, 0}, deadline);
        return task.at(2);
    });
    if (team) refreshTeamCriticalPath(connection, deadline, *team);
    return portus::Json::object({{"ok", true}});
}, connection, deadline, id); /* augur-inject:contract-end:e41fe07b */ }
}
