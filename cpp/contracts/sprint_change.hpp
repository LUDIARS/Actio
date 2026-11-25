#pragma once
#include "augur/contract_runtime.hpp"
#include "../src/db/sprint_write.hpp"

namespace actio::contracts {
inline const auto sprint_change = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view team, std::string_view id, const portus::Json& input) {
        return result.at("teamId") == portus::Json(team) && result.at("id") == portus::Json(id)
            && result.at("revision") == portus::Json(input.at("revision").as_number() + 1);
    });
}
