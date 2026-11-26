#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// Removing an existing group of the team answers {ok: true}.
inline const auto backlog_ungroup = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view team, std::string_view group) {
        return !team.empty() && !group.empty() && result.members().size() == 1
            && result.at("ok") == portus::Json(true);
    });
}
