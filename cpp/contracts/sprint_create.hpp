#pragma once
#include "augur/contract_runtime.hpp"
#include "../src/db/sprint_write.hpp"

namespace actio::contracts {
inline const auto sprint_create = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view team, const portus::Json&) {
        return result.at("teamId") == portus::Json(team) && result.at("revision") == portus::Json(0)
            && result.at("status") == portus::Json("planning") && !result.at("id").as_string().empty();
    });
}
