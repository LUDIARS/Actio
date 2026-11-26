#pragma once
#include <set>
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
inline const auto task_categories = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline) {
        const auto& items = result.at("items");
        if (!result.is_object() || result.members().size() != 1 || !items.is_array()) return false;
        std::set<std::string_view> seen;
        for (const auto& item : items.items()) {
            if (!item.is_string() || !seen.emplace(item.as_string()).second) return false;
        }
        return true;
    });
}
