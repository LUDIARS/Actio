#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Insert a timetable schedule for the group with Node's defaults and return its row.
portus::Json createGroupSchedule(portus::DbConnection& connection, portus::DbDeadline deadline,
                                 std::string_view group, const portus::Json& input);
}
