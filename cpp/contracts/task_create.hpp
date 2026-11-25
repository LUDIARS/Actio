#pragma once
#include "augur/contract_runtime.hpp"
#include "../src/db/task_write.hpp"

namespace actio::contracts {
inline const auto task_create = augur::post_only(
    [](const actio::TaskCreation& result, const portus::DbConnection&, portus::DbDeadline, const portus::Json&) {
        return !result.task.at("id").as_string().empty() && result.task.find("requirements")
            && result.task.find("pluginPayload") && result.task.find("updatedAt");
    });
}
