#include "pm_project_read.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:42c27e76 */
#include "../../contracts/pm_projects.hpp" /* augur-inject:contract-predicate:c7e54901 */

namespace actio {
namespace {
// Discard the token in PostgreSQL. Even legacy plaintext values stay out of the result.
constexpr std::string_view projectSelect = R"sql(
    SELECT json_build_object(
        'id', id, 'name', name, 'source', source,
        'sourceConfig', (source_config - 'token') || jsonb_build_object(
            'hasToken', coalesce(jsonb_typeof(source_config->'token') = 'string'
                                 AND length(source_config->>'token') > 0, false)),
        'syncIntervalMinutes', sync_interval_minutes, 'lastSyncedAt', last_synced_at,
        'lastSyncResult', last_sync_result, 'reminderSettings', reminder_settings, 'ownerId', owner_id,
        'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) FROM pm_projects
    )sql";
}

portus::Json listPmProjects(portus::DbConnection& connection, portus::DbDeadline deadline) { return ::augur::invoke_observed(::augur::ContractSpec{"C-39", "187ae1da", "src/db/pm_project_read.cpp:20"}, actio::contracts::pm_projects, [&]() -> portus::Json { /* augur-inject:contract-wrap:187ae1da */
    const auto rows = connection.query({projectSelect, {}, portus::db_max_rows}, deadline);
    auto projects = portus::Json::array();
    for (const auto& row : rows) projects.push_back(portus::Json::parse(row.at(0).value()));
    return portus::Json::object({{"projects", std::move(projects)}});
}, connection, deadline); /* augur-inject:contract-end:187ae1da */ }

portus::Json readPmProject(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id) {
    const auto sql = std::string(projectSelect) + " WHERE id = $1";
    const auto rows = connection.query({sql, {id}, 1}, deadline);
    return rows.empty() ? portus::Json() : portus::Json::parse(rows.front().at(0).value());
}
}
