#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Queue notifications for a committed task mutation using the existing outbox.
void queueTaskNotifications(portus::DbConnection& connection, portus::DbDeadline deadline,
                            const portus::Json& before, const portus::Json& after);
}
