#pragma once
#include <string>
#include "portus/db.hpp"
#include "write_input.hpp"

namespace actio {
// Serialize planning mutations of one team, as Node's PlanningPostgres.transaction does,
// and reject teams that are not registered in team_refs.
inline void lockTeamPlan(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view team) {
    const auto key = "actio-planning:" + std::string(team);
    connection.query({"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", {key}, 1}, deadline);
    if (connection.query({"SELECT 1 FROM team_refs WHERE id = $1", {team}, 1}, deadline).empty())
        throw WriteError("Forbidden", 403);
}
}
