#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/json.hpp"
#include <format>

namespace actio::contracts {
inline const auto timetable = augur::post_only([](const portus::Json& result) {
    const auto& periods = result.at("periods");
    if (result.at("days") != portus::Json::array({"月", "火", "水", "木", "金", "土", "日"})
        || !periods.is_array() || periods.items().size() != 11) return false;
    for (int index = 0; index < 11; ++index) {
        const auto& period = periods.items().at(static_cast<std::size_t>(index));
        if (period.at("period") != portus::Json(index + 1)
            || period.at("start") != portus::Json(std::format("{:02}:30", 9 + index))
            || period.at("end") != portus::Json(std::format("{:02}:30", 10 + index))) return false;
    }
    return result.at("description") == "1コマ=1時間, 9:30開始, 月〜日(7日間)";
});
}
