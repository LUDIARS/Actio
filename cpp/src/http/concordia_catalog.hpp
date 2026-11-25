#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Project the full team catalog as seen by the local owner.
portus::Json listOwnerTeams(portus::DbConnection& connection, portus::DbDeadline deadline);
// Project active Concordia projects in code order.
portus::Json listCcProjects(portus::DbConnection& connection, portus::DbDeadline deadline);
}
