#pragma once
#include <array>
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// An updated event stays in the group and carries every submitted field.
inline const auto group_event_update = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view group,
       std::string_view event, const portus::Json& input) {
        if (result.at("id").as_string() != event || result.at("groupId").as_string() != group) return false;
        constexpr std::array<std::string_view, 8> keys{
            "title", "description", "date", "endDate", "allDay", "period", "duration", "eventType"};
        for (const auto key : keys) {
            const auto* submitted = input.find(key);
            if (submitted && !(result.at(key) == *submitted)) return false;
        }
        return true;
    });
}
