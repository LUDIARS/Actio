#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
inline const auto task_delete = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view id) {
        return !id.empty() && result.is_object() && result.members().size() == 1
            && result.at("ok") == portus::Json(true);
    });
}
