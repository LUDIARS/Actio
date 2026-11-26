#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Combine active task labels and the local owner's saved registrations.
portus::Json readTaskCategories(portus::DbConnection& connection, portus::DbDeadline deadline);
// Register one label and return the updated category list.
portus::Json registerTaskCategory(portus::DbConnection& connection, portus::DbDeadline deadline,
                                  const portus::Json& input);
// Remove a registration while preserving all labels attached to active tasks.
portus::Json unregisterTaskCategory(portus::DbConnection& connection, portus::DbDeadline deadline,
                                    std::string_view name);
}
