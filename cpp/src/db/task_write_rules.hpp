#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Validate the effective task state against current team, provenance and planning rules.
void validateTaskWrite(portus::DbConnection& connection, portus::DbDeadline deadline,
                       portus::Json& changes, const portus::Json& current);
// The local owner is eligible once the caller verifies that the team exists.
bool validTaskAssignee(portus::DbConnection& connection, portus::DbDeadline deadline,
                       std::string_view team, std::string_view assignee);
}
