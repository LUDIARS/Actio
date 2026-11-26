#include "group_schedule.hpp"
#include <string>
#include "actio/local_owner.hpp"
#include "portus/id.hpp"
#include "group_event_input.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:c116a737 */
#include "../../contracts/group_schedule_create_contract.hpp" /* augur-inject:contract-predicate:32e31334 */

namespace actio {
portus::Json createGroupSchedule(portus::DbConnection& connection, portus::DbDeadline deadline,
                                 std::string_view group, const portus::Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-53", "81870715", "src/db/group_schedule.cpp:8"}, actio::contracts::group_schedule_create, [&]() -> portus::Json { /* augur-inject:contract-wrap:81870715 */
    const auto values = groupScheduleCreate(input);
    const auto id = portus::uuidv4();
    const portus::DbText date = values.date ? portus::DbText(*values.date) : std::nullopt;
    // Node does not take a description for this route, so the column stays NULL.
    const auto rows = connection.query({R"sql(
        INSERT INTO group_schedules(id, group_id, title, description, day, period, duration, date, schedule_type,
            created_by, created_at)
        VALUES ($1, $2, $3, NULL, $4::integer, $5::integer, $6::integer, $7, $8, $9,
            statement_timestamp() AT TIME ZONE 'UTC')
        RETURNING json_build_object(
            'id', id, 'groupId', group_id, 'title', title, 'description', description, 'day', day,
            'period', period, 'duration', duration, 'date', date, 'scheduleType', schedule_type,
            'createdBy', created_by, 'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        )sql", {id, group, values.title, values.day, values.period, values.duration, date, values.scheduleType,
               local_owner_id}, 1}, deadline);
    return portus::Json::parse(rows.at(0).at(0).value());
}, connection, deadline, group, input); /* augur-inject:contract-end:81870715 */ }
}
