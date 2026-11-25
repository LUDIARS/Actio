#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Delete an owned, unassigned task and refresh its former team's derived fields.
portus::Json deleteTask(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id);
}
