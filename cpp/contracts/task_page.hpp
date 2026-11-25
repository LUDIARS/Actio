#pragma once
#include "augur/contract_runtime.hpp"
#include "../src/db/task_list_query.hpp"

namespace actio::contracts {
inline const auto task_page = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       const actio::TaskListQuery& input) {
        const auto& rows = result.at(input.memoria ? "items" : "tasks");
        const auto* next = result.find("nextCursor");
        if (input.limit == 0 || !rows.is_array() || rows.items().size() > input.limit || !next) return false;
        if (!next->is_null()) {
            const auto key = actio::decodeTaskCursor(next->as_string(), input.sort);
            if (!key || rows.items().size() != input.limit || key->at("id") != rows.items().back().at("id"))
                return false;
        }
        for (const auto& row : rows.items()) {
            if (!row.at("id").is_string() || row.find("requirements") || row.find("completionEvidence")
                || row.find("publicSummary") || (row.find("description") != nullptr)
                    != (!input.memoria && input.includeDescription)) return false;
        }
        return true;
    });
}
