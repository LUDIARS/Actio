#pragma once
#include <string_view>

namespace actio {
inline constexpr std::string_view sprintDocument = R"sql(
    json_build_object('id', id, 'teamId', team_id, 'name', name, 'goal', goal,
        'startsOn', starts_on, 'endsOn', ends_on, 'originalEndsOn', original_ends_on,
        'cadenceDays', cadence_days, 'bufferEndsOn', buffer_ends_on, 'status', status,
        'capacityMinutes', capacity_minutes, 'revision', revision)
)sql";
}
