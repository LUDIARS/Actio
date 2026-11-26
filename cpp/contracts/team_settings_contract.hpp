#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// The merged settings hold every documented key once and keep each submitted value.
inline const auto team_settings = augur::post_only(
    [](const portus::Json& result, const portus::Json&, const portus::Json& patch) {
        if (!result.is_object() || result.members().size() != 16) return false;
        for (const auto& [key, value] : patch.members()) {
            if (result.at(key) != value) return false;
        }
        return true;
    });
}
