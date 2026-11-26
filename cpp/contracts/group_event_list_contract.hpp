#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// A member's listing answers {events} holding only the requested group's events.
inline const auto group_event_list = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view group) {
        if (group.empty() || result.members().size() != 1 || !result.at("events").is_array()) return false;
        for (const auto& event : result.at("events").items()) {
            if (event.at("groupId").as_string() != group || !event.at("allDay").is_bool()) return false;
        }
        return true;
    });
}
