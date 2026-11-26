#include "group_events.hpp"
#include <string>
#include <vector>
#include "actio/local_owner.hpp"
#include "portus/id.hpp"
#include "group_event_input.hpp"
#include "write_input.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:92c3fb70 */
#include "../../contracts/group_event_list_contract.hpp" /* augur-inject:contract-predicate:edad1fa8 */
#include "../../contracts/group_event_create_contract.hpp" /* augur-inject:contract-predicate:f423f92b */
#include "../../contracts/group_event_update_contract.hpp" /* augur-inject:contract-predicate:9b64c468 */
#include "../../contracts/group_event_delete_contract.hpp" /* augur-inject:contract-predicate:417e556e */

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

// The row as Drizzle returns it to Node, with created_at stored as UTC.
constexpr std::string_view eventJson = R"sql(json_build_object(
    'id', id, 'groupId', group_id, 'title', title, 'description', description, 'date', date,
    'endDate', end_date, 'allDay', all_day, 'period', period, 'duration', duration, 'eventType', event_type,
    'createdBy', created_by, 'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))sql";

Json single(const std::vector<portus::DbRow>& rows) {
    if (rows.empty()) throw WriteError("Event not found", 404);
    return Json::parse(rows.front().at(0).value());
}

std::vector<portus::DbText> bind(const std::vector<std::optional<std::string>>& values) {
    std::vector<portus::DbText> params;
    params.reserve(values.size());
    for (const auto& value : values) params.push_back(value ? portus::DbText(*value) : std::nullopt);
    return params;
}
}

void requireGroupMember(DbConnection& connection, DbDeadline deadline, std::string_view group) {
    if (group.empty() || group.contains('\0')
        || connection.query({"SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
                             {group, local_owner_id}, 1}, deadline).empty())
        throw WriteError("Not a member", 403);
}

void requireGroupEvent(DbConnection& connection, DbDeadline deadline, std::string_view group,
                       std::string_view event) {
    if (event.empty() || event.contains('\0')
        || connection.query({"SELECT 1 FROM group_events WHERE id = $1 AND group_id = $2", {event, group}, 1},
                            deadline).empty())
        throw WriteError("Event not found", 404);
}

Json listGroupEvents(DbConnection& connection, DbDeadline deadline, std::string_view group) { return ::augur::invoke_observed(::augur::ContractSpec{"C-49", "88302bfa", "src/db/group_events.cpp:49"}, actio::contracts::group_event_list, [&]() -> Json { /* augur-inject:contract-wrap:88302bfa */
    const auto sql = "SELECT " + std::string(eventJson)
        + " FROM group_events WHERE group_id = $1 ORDER BY date, created_at, id";
    auto events = Json::array();
    for (const auto& row : connection.query({sql, {group}, portus::db_max_rows}, deadline))
        events.push_back(Json::parse(row.at(0).value()));
    return Json::object({{"events", std::move(events)}});
}, connection, deadline, group); /* augur-inject:contract-end:88302bfa */ }

Json createGroupEvent(DbConnection& connection, DbDeadline deadline, std::string_view group, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-50", "9f57d07c", "src/db/group_events.cpp:58"}, actio::contracts::group_event_create, [&]() -> Json { /* augur-inject:contract-wrap:9f57d07c */
    const auto columns = groupEventCreate(input);
    std::vector<std::optional<std::string>> values{portus::uuidv4(), std::string(group)};
    values.insert(values.end(), columns.values.begin(), columns.values.end());
    values.emplace_back(std::string(local_owner_id));
    const auto sql = R"sql(
        INSERT INTO group_events(id, group_id, title, description, date, end_date, all_day, period, duration,
            event_type, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::boolean, $8::integer, $9::integer, $10, $11,
            statement_timestamp() AT TIME ZONE 'UTC')
        RETURNING )sql" + std::string(eventJson);
    return single(connection.query({sql, bind(values), 1}, deadline));
}, connection, deadline, group, input); /* augur-inject:contract-end:9f57d07c */ }

Json updateGroupEvent(DbConnection& connection, DbDeadline deadline, std::string_view group, std::string_view event,
                      const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-51", "697edc74", "src/db/group_events.cpp:72"}, actio::contracts::group_event_update, [&]() -> Json { /* augur-inject:contract-wrap:697edc74 */
    const auto columns = groupEventUpdate(input);
    std::vector<std::optional<std::string>> values{std::string(event), std::string(group)};
    for (std::size_t column = 0; column < group_event_keys.size(); ++column) {
        values.emplace_back(columns.present.at(column) ? "true" : "false");
        values.push_back(columns.values.at(column));
    }
    // A column changes only when its flag is set, so an empty body returns the stored row unchanged.
    const auto sql = R"sql(
        UPDATE group_events SET
            title = CASE WHEN $3::boolean THEN $4::text ELSE title END,
            description = CASE WHEN $5::boolean THEN $6::text ELSE description END,
            date = CASE WHEN $7::boolean THEN $8::text ELSE date END,
            end_date = CASE WHEN $9::boolean THEN $10::text ELSE end_date END,
            all_day = CASE WHEN $11::boolean THEN $12::boolean ELSE all_day END,
            period = CASE WHEN $13::boolean THEN $14::integer ELSE period END,
            duration = CASE WHEN $15::boolean THEN $16::integer ELSE duration END,
            event_type = CASE WHEN $17::boolean THEN $18::text ELSE event_type END
        WHERE id = $1 AND group_id = $2
        RETURNING )sql" + std::string(eventJson);
    return single(connection.query({sql, bind(values), 1}, deadline));
}, connection, deadline, group, event, input); /* augur-inject:contract-end:697edc74 */ }

Json deleteGroupEvent(DbConnection& connection, DbDeadline deadline, std::string_view group, std::string_view event) { return ::augur::invoke_observed(::augur::ContractSpec{"C-52", "4cde0529", "src/db/group_events.cpp:96"}, actio::contracts::group_event_delete, [&]() -> Json { /* augur-inject:contract-wrap:4cde0529 */
    if (event.contains('\0')
        || connection.query({"DELETE FROM group_events WHERE id = $1 AND group_id = $2 RETURNING id",
                             {event, group}, 1}, deadline).empty())
        throw WriteError("Event not found", 404);
    return Json::object({{"deleted", event}});
}, connection, deadline, group, event); /* augur-inject:contract-end:4cde0529 */ }
}
