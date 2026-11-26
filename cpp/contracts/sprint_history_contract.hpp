#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// Every audit row carries the six text fields of Node's sprint history.
inline const auto sprint_history = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view, std::string_view sprint) {
        if (sprint.empty() || !result.at("changes").is_array()) return false;
        for (const auto& change : result.at("changes").items()) {
            if (change.members().size() != 6) return false;
            for (const auto* key : {"kind", "actorId", "reason", "beforeJson", "afterJson", "createdAt"}) {
                if (!change.at(key).is_string()) return false;
            }
        }
        return true;
    });
}
