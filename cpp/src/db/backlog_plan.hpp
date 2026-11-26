#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Return {changes: [{kind, actorId, reason, beforeJson, afterJson, createdAt}]} for a sprint of the team
// in audit order. Throws WriteError 404 when the sprint does not belong to the team.
portus::Json readSprintHistory(portus::DbConnection& connection, portus::DbDeadline deadline,
                               std::string_view team, std::string_view sprint);
// Detach the group's backlog placements and delete the group under the team plan lock. Returns {ok: true}.
portus::Json ungroupBacklog(portus::DbConnection& connection, portus::DbDeadline deadline,
                            std::string_view team, std::string_view group);
// Validate {taskIds} as Node's orderInput does. Throws WriteError 400 on invalid input.
void validateBacklogOrder(const portus::Json& input);
// Store the submitted order as backlog positions when it names exactly the team's backlog. Returns {ok: true}.
portus::Json reorderBacklog(portus::DbConnection& connection, portus::DbDeadline deadline,
                            std::string_view team, const portus::Json& input);
}
