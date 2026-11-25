#include "sprint_write_input.hpp"
#include <algorithm>
#include <chrono>
#include "portus/db.hpp"
#include "portus/util.hpp"
#include "write_input.hpp"

namespace actio {
namespace {
using portus::Json;

void rejectExtra(const Json& input, std::initializer_list<std::string_view> allowed) {
    for (const auto& [key, value] : input.members()) {
        if (std::find(allowed.begin(), allowed.end(), key) == allowed.end())
            throw WriteError("Unrecognized key: " + key);
    }
}

std::string text(const Json& input, std::string_view key, std::size_t max,
                 bool trim = true, bool allowEmpty = false) {
    const auto& value = input.at(key);
    if (!validString(value)) throw WriteError(std::string(key) + " must be a string");
    const auto& raw = value.as_string();
    const std::string result(trim ? portus::trim(raw) : std::string_view(raw));
    if ((!allowEmpty && result.empty()) || utf16Length(result) > max)
        throw WriteError(std::string(key) + " has an invalid length");
    return result;
}

bool validDate(std::string_view value) {
    if (value.size() != 10 || value[4] != '-' || value[7] != '-') return false;
    auto number = [](std::string_view digits) {
        unsigned n = 0;
        for (char c : digits) {
            if (c < '0' || c > '9') return 10000u;
            n = n * 10 + static_cast<unsigned>(c - '0');
        }
        return n;
    };
    const auto year = number(value.substr(0, 4));
    const auto month = number(value.substr(5, 2));
    const auto day = number(value.substr(8, 2));
    if (year > 9999 || month > 12 || day > 31) return false;
    return std::chrono::year_month_day{
        std::chrono::year(static_cast<int>(year)), std::chrono::month(month), std::chrono::day(day)
    }.ok();
}

void requireDate(const Json& input, std::string_view key) {
    if (!validDate(input.at(key).as_string())) throw WriteError("実在する日付を指定してください");
}

void validateDates(const Json& input) {
    requireDate(input, "startsOn");
    requireDate(input, "endsOn");
    requireDate(input, "bufferEndsOn");
    if (input.at("startsOn").as_string() > input.at("endsOn").as_string()
        || input.at("endsOn").as_string() > input.at("bufferEndsOn").as_string())
        throw WriteError("開始日・締め切り・バッファ上限の順で指定してください");
    if (!isInteger(input.at("cadenceDays"), 1, 366)) throw WriteError("cadenceDays must be between 1 and 366");
    if (!input.find("capacityMinutes") || (!input.at("capacityMinutes").is_null()
        && !isInteger(input.at("capacityMinutes"), 1)))
        throw WriteError("capacityMinutes must be a positive integer or null");
}
}

Json newSprintInput(const Json& input) {
    rejectExtra(input, {"name", "goal", "startsOn", "endsOn", "cadenceDays", "bufferEndsOn", "capacityMinutes"});
    auto result = input;
    result.set("name", text(input, "name", 200));
    result.set("goal", input.find("goal") ? text(input, "goal", 5000, false, true) : "");
    if (!input.find("capacityMinutes")) result.set("capacityMinutes", Json());
    validateDates(result);
    return result;
}

Json sprintChangeInput(const Json& input) {
    auto result = input;
    if (!isInteger(input.at("revision"), 0)) throw WriteError("revision must be a non-negative integer");
    result.set("reason", text(input, "reason", 2000));
    const auto& action = input.at("action").as_string();
    if (action == "update_goal") {
        rejectExtra(input, {"action", "revision", "reason", "goal"});
        result.set("goal", text(input, "goal", 5000));
    } else if (action == "extend") {
        rejectExtra(input, {"action", "revision", "reason", "endsOn"});
        requireDate(input, "endsOn");
    } else if (action == "reschedule") {
        rejectExtra(input, {"action", "revision", "reason", "startsOn", "endsOn", "bufferEndsOn", "cadenceDays", "capacityMinutes"});
        validateDates(input);
    } else if (action == "assign" || action == "remove") {
        rejectExtra(input, {"action", "revision", "reason", "taskId"});
        text(input, "taskId", portus::db_max_value_bytes, false);
    } else if (action == "start" || action == "close") {
        rejectExtra(input, {"action", "revision", "reason"});
    } else {
        throw WriteError("Invalid sprint action");
    }
    return result;
}
}
