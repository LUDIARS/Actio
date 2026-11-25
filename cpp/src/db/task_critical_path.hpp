#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Compute the current backlog graph for an authorized team without persisting derived fields.
portus::Json readTeamCriticalPath(portus::DbConnection& connection, portus::DbDeadline deadline,
                                  std::string_view team);

// Refresh the old and new team graphs after a write and reload the response projection.
void refreshTaskCriticalPath(portus::DbConnection& connection, portus::DbDeadline deadline,
                             const portus::Json& previousTeam, portus::Json& task);
}
