#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// List projects with public connection settings only.
portus::Json listPmProjects(portus::DbConnection& connection, portus::DbDeadline deadline);
// Return one public project document, or null if its ID does not exist.
portus::Json readPmProject(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view id);
}
