#include "team_admin.hpp"
#include "task_read.hpp"
#include "team_settings.hpp"
#include "write_input.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:23019454 */
#include "../../contracts/team_member_contract.hpp" /* augur-inject:contract-predicate:17ae88d1 */

namespace actio {
namespace {
using portus::DbConnection;
using portus::DbDeadline;
using portus::Json;

// Team ids are text keys. PostgreSQL rejects embedded NUL, so such ids name no team.
bool usableKey(std::string_view key) { return !key.empty() && !key.contains('\0'); }

Json storedJson(const std::optional<std::string>& value) {
    return value ? Json::parse(*value) : Json();
}
}

Json listUserMemberships(DbConnection& connection, DbDeadline deadline, std::string_view user) {
    auto memberships = Json::array();
    if (!usableKey(user)) return Json::object({{"memberships", std::move(memberships)}});
    const auto rows = connection.query({
        "SELECT team_id, role FROM team_members WHERE user_id = $1 ORDER BY team_id",
        {user}, portus::db_max_rows
    }, deadline);
    for (const auto& row : rows) {
        memberships.push_back(Json::object({{"teamId", row.at(0).value()}, {"role", row.at(1).value()}}));
    }
    return Json::object({{"memberships", std::move(memberships)}});
}

Json listTeamMembers(DbConnection& connection, DbDeadline deadline, std::string_view team) {
    if (!usableKey(team) || !taskTeamExists(connection, deadline, team)) return Json();
    const auto rows = connection.query({
        "SELECT user_id, role FROM team_members WHERE team_id = $1 ORDER BY user_id",
        {team}, portus::db_max_rows
    }, deadline);
    auto members = Json::array();
    for (const auto& row : rows) {
        members.push_back(Json::object({{"userId", row.at(0).value()}, {"role", row.at(1).value()}}));
    }
    return Json::object({{"members", std::move(members)}});
}

std::string teamMemberRole(const Json& input) {
    const auto& role = input.at("role");
    if (!role.is_string()) throw WriteError("role is required");
    if (role != "leader" && role != "member") throw WriteError("role must be one of: leader, member");
    return role.as_string();
}

Json putTeamMember(DbConnection& connection, DbDeadline deadline, std::string_view team,
                   std::string_view user, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-45", "bc71fc47", "src/db/team_admin.cpp:54"}, actio::contracts::team_member, [&]() -> Json { /* augur-inject:contract-wrap:bc71fc47 */
    const auto role = teamMemberRole(input);
    if (!usableKey(team)) throw WriteError("Team not found", 404);
    if (!usableKey(user)) throw WriteError("Invalid userId");
    // One statement checks the team and upserts, so a concurrent first write cannot duplicate the key.
    const auto rows = connection.query({R"sql(
        INSERT INTO team_members (team_id, user_id, role)
        SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM team_refs WHERE id = $1)
        ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role
        RETURNING role
        )sql", {team, user, role}, 1}, deadline);
    if (rows.empty()) throw WriteError("Team not found", 404);
    return Json::object({{"member", Json::object({{"teamId", team}, {"userId", user}, {"role", role}})}});
}, connection, deadline, team, user, input); /* augur-inject:contract-end:bc71fc47 */ }

Json removeTeamMember(DbConnection& connection, DbDeadline deadline, std::string_view team,
                      std::string_view user) {
    if (!usableKey(team) || !usableKey(user)) throw WriteError("Member not found", 404);
    const auto rows = connection.query({
        "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING role",
        {team, user}, 1
    }, deadline);
    if (rows.empty()) throw WriteError("Member not found", 404);
    return Json::object({{"ok", true}});
}

Json readTeamSettings(DbConnection& connection, DbDeadline deadline, std::string_view team) {
    if (!usableKey(team)) return Json();
    const auto rows = connection.query({
        "SELECT settings::text, cc_settings::text FROM team_refs WHERE id = $1", {team}, 1
    }, deadline);
    if (rows.empty()) return Json();
    return Json::object({{"settings", storedJson(rows.front().at(0))},
                         {"cc_settings", storedJson(rows.front().at(1))}});
}

Json patchTeamSettings(DbConnection& connection, DbDeadline deadline, std::string_view team,
                       const Json& patch) {
    if (!usableKey(team)) throw WriteError("Team not found", 404);
    return inWriteTransaction(connection, deadline, [&] {
        // Lock the row so concurrent patches merge in order instead of overwriting each other.
        const auto rows = connection.query({
            "SELECT settings::text FROM team_refs WHERE id = $1 FOR UPDATE", {team}, 1
        }, deadline);
        if (rows.empty()) throw WriteError("Team not found", 404);
        const auto merged = mergeTeamSettings(storedJson(rows.front().at(0)), patch);
        connection.query({
            "UPDATE team_refs SET settings = $2::jsonb WHERE id = $1", {team, merged.dump()}, 0
        }, deadline);
        return Json::object({{"settings", merged}});
    });
}

Json listTeamProjects(DbConnection& connection, DbDeadline deadline, std::string_view team) {
    if (!usableKey(team) || !taskTeamExists(connection, deadline, team)) return Json();
    const auto rows = connection.query({R"sql(
        SELECT code, name FROM project_refs
        WHERE removed_at IS NULL AND team_ids @> jsonb_build_array($1::text)
        ORDER BY code
        )sql", {team}, portus::db_max_rows}, deadline);
    auto projects = Json::array();
    for (const auto& row : rows) {
        projects.push_back(Json::object({{"code", row.at(0).value()}, {"name", row.at(1).value()}}));
    }
    return Json::object({{"projects", std::move(projects)}});
}
}
