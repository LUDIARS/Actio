#pragma once
#include "task_list_query.hpp"

namespace actio {
// Read one summary page using the authorized filters and cursor.
portus::Json readTaskPage(portus::DbConnection& connection, portus::DbDeadline deadline, const TaskListQuery& input);
// Read a full task or return JSON null for an unknown ID.
portus::Json readTaskDetail(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id);
// Read the active sprint and unassigned backlog for the checked team.
portus::Json readCurrentSprintTasks(portus::DbConnection& connection, portus::DbDeadline deadline,
                                   const TaskListQuery& input);
// The loopback owner can act as a member only for a registered team.
bool taskTeamExists(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view team);
}
