#pragma once
#include <array>
#include <optional>
#include <string>
#include "portus/json.hpp"

namespace actio {
// Event columns in statement order: title, description, date, end_date, all_day, period, duration, event_type.
inline constexpr std::array<std::string_view, 8> group_event_keys{
    "title", "description", "date", "endDate", "allDay", "period", "duration", "eventType"};

// SQL text per column (nullopt binds NULL) and whether an update sets the column.
struct GroupEventValues {
    std::array<std::optional<std::string>, group_event_keys.size()> values;
    std::array<bool, group_event_keys.size()> present{};
};

// Columns of a new group schedule as SQL text.
struct GroupScheduleValues {
    std::string title;
    std::string day;
    std::string period;
    std::string duration;
    std::optional<std::string> date;
    std::string scheduleType;
};

// Apply Node's POST /:id/events defaults. Throws WriteError 400 on missing or mistyped fields.
GroupEventValues groupEventCreate(const portus::Json& input);
// Collect the fields Node's PUT /:id/events/:eventId sets. NOT NULL columns reject null with 400.
GroupEventValues groupEventUpdate(const portus::Json& input);
// Apply Node's POST /:id/schedules checks and defaults. Throws WriteError 400.
GroupScheduleValues groupScheduleCreate(const portus::Json& input);
}
