#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Add a non-overlapping sprint and its initial audit row.
portus::Json createSprint(portus::DbConnection& connection, portus::DbDeadline deadline,
                          std::string_view team, const portus::Json& input);
// Apply a revision-checked plan change and append its audit row atomically.
portus::Json changeSprint(portus::DbConnection& connection, portus::DbDeadline deadline,
                          std::string_view team, std::string_view id, const portus::Json& input);
}
