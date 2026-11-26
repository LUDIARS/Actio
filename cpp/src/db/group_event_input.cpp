#include "group_event_input.hpp"
#include <limits>
#include "write_input.hpp"

namespace actio {
namespace {
using portus::Json;
enum Column : std::size_t { title, description, date, endDate, allDay, period, duration, eventType };

bool absent(const Json* value) { return !value || value->is_null(); }

std::string keyError(std::string_view key, std::string_view kind) {
    return std::string(key) + " must be " + std::string(kind);
}

// Read a string field. Node's `x || default` treats an empty string like a missing one.
std::optional<std::string> text(const Json& input, std::string_view key, bool emptyIsMissing = true) {
    const auto* value = input.find(key);
    if (absent(value)) return std::nullopt;
    if (!validString(*value)) throw WriteError(keyError(key, "a string"));
    if (emptyIsMissing && value->as_string().empty()) return std::nullopt;
    return value->as_string();
}

std::optional<std::string> integer(const Json& input, std::string_view key) {
    const auto* value = input.find(key);
    if (absent(value)) return std::nullopt;
    if (!isInteger(*value, std::numeric_limits<int>::min())) throw WriteError(keyError(key, "an integer"));
    return std::to_string(static_cast<long long>(value->as_number()));
}

std::string boolean(const Json& value) { return value.as_bool() ? "true" : "false"; }

// Set one PUT column. Nullable columns accept null; the others keep Node's NOT NULL constraint.
void updateColumn(GroupEventValues& out, std::size_t column, const Json& input) {
    const auto key = group_event_keys.at(column);
    const auto& value = input.at(key);
    out.present.at(column) = true;
    switch (column) {
    case title: case date: case eventType:
        if (!validString(value)) throw WriteError(keyError(key, "a string"));
        out.values.at(column) = value.as_string();
        break;
    case description: case endDate:
        out.values.at(column) = text(input, key, false);
        break;
    case allDay:
        if (!value.is_bool()) throw WriteError(keyError(key, "a boolean"));
        out.values.at(column) = boolean(value);
        break;
    default:
        out.values.at(column) = integer(input, key);
    }
}

std::string timetableIndex(const Json& value, int max, std::string_view key) {
    if (!isInteger(value, 0, max)) throw WriteError(std::string(key) + " must be 0-" + std::to_string(max));
    return std::to_string(static_cast<int>(value.as_number()));
}
}

GroupEventValues groupEventCreate(const Json& input) {
    auto titleText = text(input, "title");
    auto dateText = text(input, "date");
    if (!titleText || !dateText) throw WriteError("title and date are required");
    GroupEventValues out;
    out.present.fill(true);
    out.values.at(title) = std::move(titleText);
    out.values.at(description) = text(input, "description");
    out.values.at(date) = std::move(dateText);
    out.values.at(endDate) = text(input, "endDate");
    const auto* all = input.find("allDay");
    if (!absent(all) && !all->is_bool()) throw WriteError(keyError("allDay", "a boolean"));
    // Node stores `allDay !== false`.
    out.values.at(allDay) = absent(all) ? "true" : boolean(*all);
    out.values.at(period) = integer(input, "period");
    out.values.at(duration) = integer(input, "duration").value_or("1");
    out.values.at(eventType) = text(input, "eventType").value_or("event");
    return out;
}

GroupEventValues groupEventUpdate(const Json& input) {
    GroupEventValues out;
    for (std::size_t column = 0; column < group_event_keys.size(); ++column) {
        if (input.find(group_event_keys.at(column))) updateColumn(out, column, input);
    }
    return out;
}

GroupScheduleValues groupScheduleCreate(const Json& input) {
    auto titleText = text(input, "title");
    const auto* day = input.find("day");
    const auto* periodValue = input.find("period");
    if (!titleText || absent(day) || absent(periodValue)) throw WriteError("title, day, period are required");
    GroupScheduleValues out;
    out.title = std::move(*titleText);
    out.day = timetableIndex(*day, 6, "day");
    out.period = timetableIndex(*periodValue, 10, "period");
    // Node stores `duration || 1`, so 0 also becomes one period.
    const auto length = integer(input, "duration");
    out.duration = !length || *length == "0" ? "1" : *length;
    out.date = text(input, "date");
    out.scheduleType = text(input, "scheduleType").value_or("recurring");
    return out;
}
}
