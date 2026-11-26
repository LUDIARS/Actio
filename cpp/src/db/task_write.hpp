#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// A persisted task and whether this request inserted it.
struct TaskCreation {
    portus::Json task;
    bool created;
};
// Insert a task, or return the existing accessible row on a source replay.
TaskCreation createTask(portus::DbConnection& connection, portus::DbDeadline deadline,
                        const portus::Json& input);
// Update a task owned by or assigned to the verified local owner.
portus::Json patchTask(portus::DbConnection& connection, portus::DbDeadline deadline,
                      std::string_view id, const portus::Json& input);
// Persist the lane-specific fields of an accessible team task.
portus::Json changeTaskLane(portus::DbConnection& connection, portus::DbDeadline deadline,
                           std::string_view id, const portus::Json& input);
}
