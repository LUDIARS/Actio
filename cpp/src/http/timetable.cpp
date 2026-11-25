#include "actio/timetable.hpp"
#include <format>
#include "augur/contract_runtime.hpp" /* augur-inject:import:6ef8efb5 */
#include "../../contracts/timetable_contract.hpp" /* augur-inject:contract-predicate:ba788478 */

namespace actio {
namespace {
portus::Json timetable() { return ::augur::invoke_observed(::augur::ContractSpec{"C-41", "61264694", "src/http/timetable.cpp:6"}, actio::contracts::timetable, [&]() -> portus::Json { /* augur-inject:contract-wrap:61264694 */
    constexpr int startHour = 9;
    constexpr int periodCount = 11;
    auto periods = portus::Json::array();
    for (int i = 0; i < periodCount; ++i) {
        periods.push_back(portus::Json::object({
            {"period", i + 1}, {"start", std::format("{:02}:30", startHour + i)},
            {"end", std::format("{:02}:30", startHour + i + 1)}
        }));
    }
    return portus::Json::object({
        {"days", portus::Json::array({"月", "火", "水", "木", "金", "土", "日"})},
        {"periods", std::move(periods)}, {"description", "1コマ=1時間, 9:30開始, 月〜日(7日間)"}
    });
}); /* augur-inject:contract-end:61264694 */ }
}

void addTimetableRoute(portus::HttpServerOptions& options) {
    options.routes.emplace_back("GET", "/api/timetable", [](portus::RequestContext&) {
        return portus::json(timetable());
    });
}
}
