#pragma once
#include <set>
#include <string>
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// A stored order names each submitted backlog task once and answers {ok: true}.
inline const auto backlog_order = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view team, const portus::Json& input) {
        std::set<std::string, std::less<>> ids;
        for (const auto& id : input.at("taskIds").items()) {
            if (!id.is_string() || !ids.insert(id.as_string()).second) return false;
        }
        return !team.empty() && result.members().size() == 1 && result.at("ok") == portus::Json(true);
    });
}
