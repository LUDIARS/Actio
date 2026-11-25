#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <set>

namespace actio::contracts {
inline const auto pm_critical_path = augur::post_only(
    [](const portus::Json& result, const std::vector<portus::DbRow>& rows,
       std::chrono::system_clock::time_point) {
        const auto& path = result.at("path");
        const auto& days = result.at("totalEstimatedDays");
        const auto& risk = result.at("riskLevel").as_string();
        const auto& date = result.at("projectedCompletionDate").as_string();
        if (!path.is_array() || path.items().empty() != rows.empty() || !days.is_number()
            || days.as_number() < 0 || date.size() != 10 || date.at(4) != '-' || date.at(7) != '-'
            || (risk != "low" && risk != "medium" && risk != "high" && risk != "critical")) return false;
        std::set<std::string_view> ids;
        for (const auto& row : rows) ids.insert(row.at(0).value());
        double duration = 0;
        for (const auto& node : path.items()) {
            if (!ids.erase(node.at("taskId").as_string()) || !node.at("estimatedDays").is_number()) return false;
            duration += node.at("estimatedDays").as_number();
        }
        return days.as_number() == std::max(0.0, std::ceil(duration));
    });
}
