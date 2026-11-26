#pragma once
#include <string>
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
// Return {memberships: [{teamId, role}]} for one user.
portus::Json listUserMemberships(portus::DbConnection& connection, portus::DbDeadline deadline,
                                 std::string_view user);
// Return {members: [{userId, role}]}, or null when the team is not registered.
portus::Json listTeamMembers(portus::DbConnection& connection, portus::DbDeadline deadline,
                             std::string_view team);
// Return the submitted role when it is leader or member. Throws WriteError otherwise.
std::string teamMemberRole(const portus::Json& input);
// Insert or update a membership of a registered team and return {member}.
portus::Json putTeamMember(portus::DbConnection& connection, portus::DbDeadline deadline,
                           std::string_view team, std::string_view user, const portus::Json& input);
// Delete an existing membership and return {ok: true}.
portus::Json removeTeamMember(portus::DbConnection& connection, portus::DbDeadline deadline,
                              std::string_view team, std::string_view user);
// Return {settings, cc_settings}, or null when the team is not registered.
portus::Json readTeamSettings(portus::DbConnection& connection, portus::DbDeadline deadline,
                              std::string_view team);
// Merge a validated patch into the locked team settings and return {settings}.
portus::Json patchTeamSettings(portus::DbConnection& connection, portus::DbDeadline deadline,
                               std::string_view team, const portus::Json& patch);
// Return {projects: [{code, name}]} for active projects of a registered team, or null.
portus::Json listTeamProjects(portus::DbConnection& connection, portus::DbDeadline deadline,
                              std::string_view team);
}
