#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// A created event belongs to the group, records the local owner and keeps the submitted title and date.
inline const auto group_event_create = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view group,
       const portus::Json& input) {
        return !result.at("id").as_string().empty() && result.at("groupId").as_string() == group
            && result.at("createdBy") == portus::Json("actio-local") && result.at("title") == input.at("title")
            && result.at("date") == input.at("date") && result.at("allDay").is_bool()
            && result.at("eventType").is_string() && !result.at("eventType").as_string().empty();
    });
}
