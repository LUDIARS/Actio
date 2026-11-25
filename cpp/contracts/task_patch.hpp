#pragma once
#include "augur/contract_runtime.hpp"
#include "../src/db/task_write.hpp"

namespace actio::contracts {
inline const auto task_patch = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view id, const portus::Json&) {
        return result.at("id") == portus::Json(id) && result.find("requirements")
            && result.find("pluginPayload") && result.find("updatedAt");
    });
}
