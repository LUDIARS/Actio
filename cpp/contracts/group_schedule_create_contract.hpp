#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// A created group schedule belongs to the group, records the local owner and stays within the timetable.
inline const auto group_schedule_create = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view group,
       const portus::Json& input) {
        const auto day = result.at("day").as_number(-1);
        const auto period = result.at("period").as_number(-1);
        return result.at("groupId").as_string() == group && result.at("createdBy") == portus::Json("actio-local")
            && result.at("title") == input.at("title") && day >= 0 && day <= 6 && period >= 0 && period <= 10
            && result.at("duration").is_number() && !result.at("scheduleType").as_string().empty();
    });
}
