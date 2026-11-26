#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// Removing an event of the group answers {deleted: eventId}.
inline const auto group_event_delete = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view group,
       std::string_view event) {
        return !group.empty() && result.members().size() == 1 && result.at("deleted").as_string() == event;
    });
}
