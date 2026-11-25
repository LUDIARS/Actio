#include "pm_critical_path.hpp"
#include <cmath>
#include <deque>
#include <format>
#include <map>
#include "augur/contract_runtime.hpp" /* augur-inject:import:d7a109b0 */
#include "../../contracts/pm_critical_path_contract.hpp" /* augur-inject:contract-predicate:aa0ff038 */

namespace actio {
namespace {
using portus::Json;
constexpr double hoursPerDay = 8;

struct PmTask {
    Json node;
    Json dependencies;
    double estimate;
    double distance;
    std::size_t incoming = 0;
    std::optional<std::size_t> predecessor;
    std::vector<std::size_t> dependents;
};

PmTask readTask(const portus::DbRow& row) {
    const auto assignees = Json::parse(row.at(4).value());
    const auto assignee = assignees.items().empty() ? Json() : assignees.items().front();
    const auto estimate = row.at(3) ? Json::parse(*row.at(3)).as_number() / hoursPerDay : 1;
    return {
        Json::object({{"taskId", row.at(0).value()}, {"title", row.at(1).value()},
                      {"estimatedDays", estimate}, {"status", row.at(2).value()},
                      {"assignee", assignee.is_null() ? Json("未割り当て") : assignee}}),
        Json::parse(row.at(5).value()), estimate, estimate, 0, std::nullopt, {}
    };
}

void linkTasks(std::vector<PmTask>& tasks) {
    std::map<std::string_view, std::size_t, std::less<>> byId;
    for (std::size_t i = 0; i < tasks.size(); ++i)
        byId.emplace(tasks.at(i).node.at("taskId").as_string(), i);
    for (std::size_t i = 0; i < tasks.size(); ++i) {
        auto& task = tasks.at(i);
        for (const auto& dependency : task.dependencies.items()) {
            const auto entry = byId.find(dependency.as_string());
            if (entry == byId.end()) continue;
            tasks.at(entry->second).dependents.push_back(i);
            ++task.incoming;
        }
    }
}

// Process ready tasks in the same order as the Node implementation, preserving path tie behavior.
void measurePaths(std::vector<PmTask>& tasks) {
    std::deque<std::size_t> ready;
    for (std::size_t i = 0; i < tasks.size(); ++i)
        if (tasks.at(i).incoming == 0) ready.push_back(i);
    while (!ready.empty()) {
        const auto index = ready.front();
        ready.pop_front();
        const auto& task = tasks.at(index);
        for (const auto target : task.dependents) {
            auto& next = tasks.at(target);
            const auto distance = task.distance + next.estimate;
            if (distance > next.distance) {
                next.distance = distance;
                next.predecessor = index;
            }
            if (--next.incoming == 0) ready.push_back(target);
        }
    }
}

std::string_view riskLevel(std::size_t open, double days) {
    if (open > 10 || days > 60) return "critical";
    if (open > 5 || days > 30) return "high";
    if (open > 2 || days > 14) return "medium";
    return "low";
}

std::string completionDate(std::chrono::system_clock::time_point now, double days) {
    using namespace std::chrono;
    const auto current = floor<std::chrono::days>(now);
    constexpr auto lastDate = sys_days(year(9999) / December / 31);
    // Keep the four-digit calendar date and check the range before converting the estimate.
    if (!std::isfinite(days) || days > static_cast<double>((lastDate - current).count()))
        throw std::out_of_range("PM completion date exceeds the supported range");
    const year_month_day date(current + std::chrono::days(static_cast<std::int64_t>(days)));
    return std::format("{:04}-{:02}-{:02}", static_cast<int>(date.year()),
                       static_cast<unsigned>(date.month()), static_cast<unsigned>(date.day()));
}

std::pair<double, std::optional<std::size_t>> longestPath(const std::vector<PmTask>& tasks) {
    if (tasks.empty()) return {};
    double longest = 0;
    std::size_t end = 0;
    for (std::size_t i = 0; i < tasks.size(); ++i) {
        if (tasks.at(i).distance <= longest) continue;
        longest = tasks.at(i).distance;
        end = i;
    }
    return {longest, end};
}
}

Json calculatePmCriticalPath(const std::vector<portus::DbRow>& rows, std::chrono::system_clock::time_point now) { return ::augur::invoke_observed(::augur::ContractSpec{"C-40", "d2a8ede9", "src/db/pm_critical_path.cpp:88"}, actio::contracts::pm_critical_path, [&]() -> Json { /* augur-inject:contract-wrap:d2a8ede9 */
    std::vector<PmTask> tasks;
    tasks.reserve(rows.size());
    for (const auto& row : rows) tasks.push_back(readTask(row));
    linkTasks(tasks);
    measurePaths(tasks);

    const auto [longest, end] = longestPath(tasks);
    std::vector<std::size_t> reversePath;
    for (auto i = end; i; i = tasks.at(*i).predecessor) reversePath.push_back(*i);
    auto path = Json::array();
    std::size_t open = 0;
    for (auto i = reversePath.rbegin(); i != reversePath.rend(); ++i) {
        const auto& node = tasks.at(*i).node;
        if (node.at("status") != Json("closed")) ++open;
        path.push_back(node);
    }
    const double days = std::ceil(longest);
    return Json::object({{"path", std::move(path)}, {"totalEstimatedDays", days},
                         {"projectedCompletionDate", completionDate(now, days)}, {"riskLevel", riskLevel(open, days)}});
}, rows, now); /* augur-inject:contract-end:d2a8ede9 */ }

Json readPmCriticalPath(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id) {
    const auto rows = connection.query({
        "SELECT id, title, status, estimated_hours, assignees, blocked_by FROM pm_tasks WHERE project_id = $1",
        {id}, portus::db_max_rows
    }, deadline);
    return calculatePmCriticalPath(rows, std::chrono::system_clock::now());
}
}
