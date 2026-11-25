#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
inline const auto pm_projects = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline) {
        const auto& projects = result.at("projects");
        if (!projects.is_array()) return false;
        for (const auto& project : projects.items()) {
            const auto& config = project.at("sourceConfig");
            if (!project.at("id").is_string() || !config.is_object() || config.find("token")
                || !config.at("hasToken").is_bool()) return false;
        }
        return true;
    });
}
