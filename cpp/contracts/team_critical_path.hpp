#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"
#include <algorithm>

namespace actio::contracts {
inline const auto team_critical_path = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline, std::string_view) {
        const auto& ids = result.at("taskIds");
        const auto& tasks = result.at("tasks");
        const auto& cycles = result.at("cycles");
        const auto& days = result.at("totalDays");
        if (!ids.is_array() || !tasks.is_array() || !cycles.is_array() || !days.is_number()) return false;
        std::vector<std::pair<double, std::string>> critical;
        double end = 0;
        for (const auto& task : tasks.items()) {
            end = std::max(end, task.at("earliestFinish").as_number());
            if (task.at("isCriticalPath").as_bool())
                critical.emplace_back(task.at("earliestStart").as_number(), task.at("id").as_string());
        }
        std::ranges::sort(critical);
        if (days.as_number() != end || ids.items().size() != critical.size()) return false;
        for (std::size_t i = 0; i < critical.size(); ++i)
            if (ids.items().at(i) != critical.at(i).second) return false;
        return true;
    });
}
