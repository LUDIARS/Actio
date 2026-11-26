#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Throw WriteError 403 "Not a member" unless the local owner belongs to the group, as Node's routes check.
void requireGroupMember(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view group);
// Throw WriteError 404 "Event not found" unless the event belongs to the group.
void requireGroupEvent(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view group,
                       std::string_view event);
// Return {events} for the group in date order, bounded by the connection row cap.
portus::Json listGroupEvents(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view group);
// Insert an event with Node's defaults and return its row.
portus::Json createGroupEvent(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view group,
                              const portus::Json& input);
// Set the submitted fields of the group's event and return its row.
portus::Json updateGroupEvent(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view group,
                              std::string_view event, const portus::Json& input);
// Delete the group's event and return {deleted: eventId}.
portus::Json deleteGroupEvent(portus::DbConnection& connection, portus::DbDeadline deadline, std::string_view group,
                              std::string_view event);
}
