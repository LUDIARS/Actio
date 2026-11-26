#include "task_write.hpp"
#include "actio/local_owner.hpp"
#include "portus/id.hpp"
#include "task_critical_path.hpp"
#include "task_notifications.hpp"
#include "task_projection.hpp"
#include "task_read.hpp"
#include "task_write_input.hpp"
#include "task_write_rules.hpp"
#include "write_input.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:a251aa1e */
#include "../../contracts/task_create.hpp" /* augur-inject:contract-predicate:975888a4 */
#include "../../contracts/task_patch.hpp" /* augur-inject:contract-predicate:b728496c */
#include "../../contracts/task_lane.hpp" /* augur-inject:contract-predicate:c0255fd1 */

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

constexpr std::pair<std::string_view, std::string_view> taskColumns[] = {
    {"title", "title"}, {"description", "description"}, {"requirements", "requirements"},
    {"assigneeId", "assignee_id"}, {"groupId", "group_id"}, {"projectId", "project_id"},
    {"teamId", "team_id"}, {"lane", "lane"}, {"source", "source"}, {"sourceRef", "source_ref"},
    {"durationDays", "duration_days"}, {"storyPoints", "story_points"}, {"blockedBy", "blocked_by"},
    {"status", "status"}, {"kind", "kind"}, {"publicHidden", "public_hidden"},
    {"publicSummary", "public_summary"}, {"creatorType", "creator_type"}, {"category", "category"},
    {"priority", "priority"}, {"deadline", "deadline"}, {"estimatedMinutes", "estimated_minutes"},
    {"executorType", "executor_type"}, {"aiExecutor", "ai_executor"}, {"pluginId", "plugin_id"},
    {"pluginRef", "plugin_ref"}, {"pluginPayload", "plugin_payload"}
};
constexpr const char* timestamp = "date_trunc('milliseconds', statement_timestamp() AT TIME ZONE 'UTC')";

Json document(const std::vector<portus::DbRow>& rows) {
    return rows.empty() ? Json() : Json::parse(rows.front().at(0).value());
}

Json findBySource(DbConnection& connection, DbDeadline deadline, const Json& changes) {
    if (changes.at("source").is_null() || changes.at("sourceRef").is_null()) return {};
    const auto sql = "SELECT " + taskDocument(TaskProjection::full)
        + " FROM tasks WHERE source = $1 AND source_ref = $2";
    return document(connection.query({sql, {changes.at("source").as_string(), changes.at("sourceRef").as_string()}, 1}, deadline));
}

Json insertTask(DbConnection& connection, DbDeadline deadline, const Json& changes) {
    const auto id = portus::uuidv4();
    auto fields = Json::object();
    std::string columns = "id, owner_id, created_at, updated_at, completed_at";
    std::string values = std::string("$2, $3, ") + timestamp + ", " + timestamp
        + ", CASE WHEN input.status = 'done' THEN " + timestamp + " END";
    for (const auto& [key, col] : taskColumns) {
        if (const auto* value = changes.find(key)) {
            columns += ", ";
            columns += col;
            values += ", input.";
            values += col;
            fields.set(std::string(col), *value);
        }
    }
    const auto sql = "INSERT INTO tasks (" + columns + ") SELECT " + values
        + " FROM json_populate_record(NULL::tasks, $1::json) AS input WHERE TRUE "
          "ON CONFLICT(source, source_ref) WHERE source IS NOT NULL AND source_ref IS NOT NULL "
          "DO NOTHING RETURNING " + taskDocument(TaskProjection::full);
    const auto encoded = fields.dump();
    return document(connection.query({sql, {encoded, id, local_owner_id}, 1}, deadline));
}

Json updateTask(DbConnection& connection, DbDeadline deadline, std::string_view id, const Json& changes) {
    auto fields = Json::object();
    std::string sql = std::string("UPDATE tasks SET updated_at = ") + timestamp;
    if (changes.find("status")) {
        sql += std::string(", completed_at = CASE WHEN input.status = 'done' THEN COALESCE(tasks.completed_at, ")
            + timestamp + ") ELSE NULL END";
    }
    for (const auto& [key, col] : taskColumns) {
        if (const auto* value = changes.find(key)) {
            sql += ", ";
            sql += col;
            sql += " = input.";
            sql += col;
            fields.set(std::string(col), *value);
        }
    }
    // Keep the input composite off the RETURNING scope so projection names are unambiguous.
    sql += " FROM json_populate_record(NULL::tasks, $1::json) AS input WHERE tasks.id = $2";
    const auto encoded = fields.dump();
    const auto returning = "WITH changed AS (" + sql + " RETURNING tasks.*) SELECT "
        + taskDocument(TaskProjection::full) + " FROM changed";
    return document(connection.query({returning, {encoded, id}, 1}, deadline));
}

bool ownsOrAssigned(const Json& task) {
    return task.at("ownerId") == Json(local_owner_id) || task.at("assigneeId") == Json(local_owner_id);
}

Json lockTask(DbConnection& connection, DbDeadline deadline, std::string_view id) {
    lockTaskWrites(connection, deadline);
    const auto sql = "SELECT " + taskDocument(TaskProjection::full) + " FROM tasks WHERE id = $1 FOR UPDATE";
    auto task = document(connection.query({sql, {id}, 1}, deadline));
    if (task.is_null()) throw WriteError("Task not found", 404);
    return task;
}

void verifySourceChange(DbConnection& connection, DbDeadline deadline, const Json& changes, const Json& before) {
    if (!changes.find("source") && !changes.find("sourceRef")) return;
    auto identity = Json::object();
    for (const auto* key : {"source", "sourceRef"})
        identity.set(key, changes.find(key) ? changes.at(key) : before.at(key));
    const auto duplicate = findBySource(connection, deadline, identity);
    if (!duplicate.is_null() && duplicate.at("id") != before.at("id"))
        throw WriteError("source/source_ref already exists", 409);
}
}

TaskCreation createTask(DbConnection& connection, DbDeadline deadline, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-33", "a3bad6b1", "src/db/task_write.cpp:105"}, actio::contracts::task_create, [&]() -> TaskCreation { /* augur-inject:contract-wrap:a3bad6b1 */
    auto result = inWriteTransaction(connection, deadline, [&]() -> TaskCreation {
        auto changes = taskChanges(input, Json());
        validateTaskWrite(connection, deadline, changes, Json());
        auto task = insertTask(connection, deadline, changes);
        if (!task.is_null()) return {std::move(task), true};
        // A conflicting concurrent insert has committed by the time ON CONFLICT returns.
        task = findBySource(connection, deadline, changes);
        if (task.is_null() || (!ownsOrAssigned(task)
            && (task.at("teamId").as_string().empty()
                || !taskTeamExists(connection, deadline, task.at("teamId").as_string()))))
            throw WriteError("source/source_ref already exists", 409);
        return {std::move(task), false};
    });
    if (result.created) {
        refreshTaskCriticalPath(connection, deadline, Json(), result.task);
        queueTaskNotifications(connection, deadline, Json(), result.task);
    }
    return result;
}, connection, deadline, input); /* augur-inject:contract-end:a3bad6b1 */ }

Json patchTask(DbConnection& connection, DbDeadline deadline, std::string_view id, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-34", "e3b8dc63", "src/db/task_write.cpp:126"}, actio::contracts::task_patch, [&]() -> Json { /* augur-inject:contract-wrap:e3b8dc63 */
    Json before;
    bool refresh = false;
    auto after = inWriteTransaction(connection, deadline, [&] {
        before = lockTask(connection, deadline, id);
        if (!ownsOrAssigned(before)) throw WriteError("Forbidden", 403);
        auto changes = taskChanges(input, before);
        validateTaskWrite(connection, deadline, changes, before);
        verifySourceChange(connection, deadline, changes, before);
        for (const auto* key : {"blockedBy", "durationDays", "estimatedMinutes", "status", "lane", "teamId"})
            refresh = refresh || changes.find(key);
        return updateTask(connection, deadline, id, changes);
    });
    queueTaskNotifications(connection, deadline, before, after);
    if (refresh) refreshTaskCriticalPath(connection, deadline, before.at("teamId"), after);
    return after;
}, connection, deadline, id, input); /* augur-inject:contract-end:e3b8dc63 */ }

Json changeTaskLane(DbConnection& connection, DbDeadline deadline, std::string_view id, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-43", "646bbc1a", "src/db/task_write.cpp:155"}, actio::contracts::task_lane, [&]() -> Json { /* augur-inject:contract-wrap:646bbc1a */
    if (id.empty() || id.contains('\0')) throw WriteError("Task not found", 404);
    return inWriteTransaction(connection, deadline, [&] {
        const auto before = lockTask(connection, deadline, id);
        if (before.at("teamId").as_string().empty())
            throw WriteError("Lane transitions are only available for team tasks");
        if (!ownsOrAssigned(before)) throw WriteError("Forbidden", 403);
        const auto changes = validateTaskLaneChange(connection, deadline, input, before);
        return updateTask(connection, deadline, id, changes);
    });
}, connection, deadline, id, input); /* augur-inject:contract-end:646bbc1a */ }
}
