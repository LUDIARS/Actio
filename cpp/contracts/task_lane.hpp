#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
inline const auto task_lane = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view id, const portus::Json& input) {
        return result.at("id") == portus::Json(id) && !result.at("teamId").as_string().empty()
            && result.at("lane") == input.at("lane")
            && (result.at("lane") != "daily" || result.at("deadline").is_null());
    });
}
