#include "task_list_query.hpp"
#include <charconv>
#include <chrono>
#include <regex>
#include <span>
#include "actio/local_owner.hpp"
#include "lorica/byte_view.hpp"
#include "lorica/checked_size.hpp"
#include "lorica/input_budget.hpp"
#include "portus/util.hpp"

namespace actio {
namespace {
constexpr std::size_t queryBudget = 16 * 1024;

void checkQueryBudget(const portus::Json& query) {
    lorica::input_budget budget({queryBudget, queryBudget, 0, 0});
    for (const auto& [key, value] : query.members()) {
        const auto& text = value.as_string();
        const auto size = lorica::checked_add(key.size(), text.size());
        const auto bytes = std::as_bytes(std::span(text.data(), text.size()));
        if (!size || !lorica::byte_view::make(bytes.data(), bytes.size(), queryBudget)
            || !budget.consume(*size, 1, 0) || text.contains('\0'))
            throw std::invalid_argument("Invalid task list query");
    }
}

std::vector<std::string> splitTokens(std::string_view raw) {
    std::vector<std::string> values;
    do {
        const auto comma = raw.find(',');
        values.emplace_back(portus::trim(raw.substr(0, comma)));
        if (comma == std::string_view::npos) break;
        raw.remove_prefix(comma + 1);
    } while (true);
    return values;
}

// Canonicalize the Memoria aliases before binding the list as SQL text.
std::vector<std::string> parseStatuses(const std::string& raw) {
    if (raw.empty()) return {};
    auto statuses = splitTokens(raw);
    for (auto& status : statuses) {
        if (status == "todo") status = "open";
        if (status == "doing") status = "in_progress";
        if (status != "open" && status != "in_progress" && status != "blocked"
            && status != "done" && status != "cancelled")
            throw std::invalid_argument("status must be a comma-separated list of open, "
                "in_progress, blocked, done, cancelled (todo/doing \xe5\x8f\xaf)");
    }
    return statuses;
}

std::chrono::minutes parseOffset(const std::string& zone) {
    using namespace std::chrono;
    if (zone.size() < 5) return minutes::zero();
    const auto offset = hours(std::stoi(zone.substr(1, 2))) + minutes(std::stoi(zone.substr(zone.size() - 2)));
    return zone.front() == '-' ? -offset : offset;
}

// Bound regex input before matching and normalize to UTC milliseconds before binding.
std::optional<std::string> isoDate(const std::string& raw) {
    if (raw.size() < 10 || raw.size() > 35) return std::nullopt;
    static const std::regex pattern(
        R"(^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)"
        R"((Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$)");
    std::smatch match;
    if (!std::regex_match(raw, match, pattern)) return std::nullopt;
    using namespace std::chrono;
    const auto yearValue = std::stoi(match[1].str());
    const auto monthValue = static_cast<unsigned>(std::stoi(match[2].str()));
    const auto dayValue = static_cast<unsigned>(std::stoi(match[3].str()));
    const auto date = year(yearValue) / month(monthValue) / day(dayValue);
    if (!date.ok()) return std::nullopt;
    const auto midnight = duration_cast<milliseconds>(sys_days(date).time_since_epoch());
    if (!match[4].matched) return std::to_string(midnight.count());
    const auto hour = std::stoi(match[4].str());
    const auto minute = std::stoi(match[5].str());
    const auto second = match[6].matched ? std::stoi(match[6].str()) : 0;
    const auto fractionMs = match[7].matched ? std::stoi((match[7].str() + "00").substr(0, 3)) : 0;
    if (hour > 24 || minute > 59 || second > 59 || (hour == 24 && (minute || second || fractionMs)))
        return std::nullopt;
    return std::to_string((midnight + hours(hour) + minutes(minute) + seconds(second)
        + milliseconds(fractionMs) - parseOffset(match[8].str())).count());
}

std::optional<std::string> requireDate(const portus::Json& query, const char* field) {
    const auto& raw = query.at(field).as_string();
    if (raw.empty()) return std::nullopt;
    const auto result = isoDate(raw);
    if (!result) throw std::invalid_argument(std::string(field) + " must be an ISO 8601 date-time");
    return result;
}

// Validate paging controls before filters so they fail in the same order as the Node route.
void parsePage(const portus::Json& query, TaskListQuery& input) {
    const auto& sort = query.at("sort").as_string();
    if (sort == "personal") input.sort = TaskSort::personal;
    if (sort == "priority") input.sort = TaskSort::priority;
    if (const auto* limit = query.find("limit")) {
        const auto& raw = limit->as_string();
        const auto end = raw.data() + raw.size();
        const auto parsed = std::from_chars(raw.data(), end, input.limit);
        if (parsed.ec != std::errc{} || parsed.ptr != end || input.limit == 0
            || input.limit > task_page_max)
            throw std::invalid_argument("limit must be an integer between 1 and 500");
    }
    input.statuses = parseStatuses(query.at("status").as_string());
    const auto& include = query.at("include").as_string();
    if (!include.empty()) {
        for (const auto& token : splitTokens(include))
            if (token != "description") throw std::invalid_argument("include must be description");
        input.includeDescription = true;
    }
    const auto& cursor = query.at("cursor").as_string();
    if (!cursor.empty()) {
        input.after = decodeTaskCursor(cursor, input.sort);
        if (!input.after)
            throw std::invalid_argument("cursor is invalid (use nextCursor from the previous page with the same sort)");
    }
}

void applyScope(const portus::Json& query, TaskListQuery& input) {
    input.team = query.at("team_id").as_string();
    if (!input.team.empty()) return;
    input.group = query.at("groupId").as_string();
    if (!input.group.empty()) return;
    const auto& scope = query.at("scope").as_string();
    if (scope == "owned" || !query.find("scope")) input.owner = local_owner_id;
    if (scope == "assigned") input.assignee = local_owner_id;
}
}

TaskListQuery parseTaskListQuery(const portus::Json& query) {
    checkQueryBudget(query);
    TaskListQuery input;
    parsePage(query, input);
    applyScope(query, input);
    input.project = query.at("project").as_string();
    input.kind = query.at("kind").as_string();
    input.plugin = query.at("pluginId").as_string();
    input.sprint = query.at("sprint_id").as_string();
    input.lane = query.at("lane").as_string();
    if (!input.lane.empty() && input.lane != "daily" && input.lane != "backlog")
        throw std::invalid_argument("lane must be daily or backlog");
    input.executor = query.at("executor_type").as_string();
    if (query.find("executor_type") && input.executor != "human" && input.executor != "ai")
        throw std::invalid_argument("executor_type must be human or ai");
    if (const auto* view = query.find("view")) {
        if (*view != "current_sprint") throw std::invalid_argument("view must be current_sprint");
        if (input.team.empty()) throw std::invalid_argument("view=current_sprint requires team_id");
        input.currentSprint = true;
    }
    input.memoria = query.at("format") == "memoria";
    input.extraAssignee = portus::trim(query.at("assignee").as_string());
    input.title = portus::trim(query.at("q").as_string());
    input.category = portus::trim(query.at("category").as_string());
    input.updatedSince = requireDate(query, "updated_since");
    input.dueAfter = requireDate(query, "due_after");
    input.dueBefore = isoDate(query.at("dueBefore").as_string());
    return input;
}
}
