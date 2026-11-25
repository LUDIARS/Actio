#pragma once
#include <chrono>
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Compute the PM response from the projected task rows at a supplied instant.
portus::Json calculatePmCriticalPath(const std::vector<portus::DbRow>& rows,
                                     std::chrono::system_clock::time_point now);
// Load the project's tasks and calculate the PM critical path.
portus::Json readPmCriticalPath(portus::DbConnection& connection, portus::DbDeadline deadline,
                                std::string_view id);
}
