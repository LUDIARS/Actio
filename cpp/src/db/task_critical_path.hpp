#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Refresh the old and new team graphs after a write and reload the response projection.
void refreshTaskCriticalPath(portus::DbConnection& connection, portus::DbDeadline deadline,
                             const portus::Json& previousTeam, portus::Json& task);
}
