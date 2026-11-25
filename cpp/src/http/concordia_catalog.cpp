#include "concordia_catalog.hpp"

namespace actio {
portus::Json listOwnerTeams(portus::DbConnection& connection, portus::DbDeadline deadline) {
    const auto rows = connection.query({
        "SELECT id, slug, name FROM team_refs ORDER BY id", {}, portus::db_max_rows
    }, deadline);
    auto teams = portus::Json::array();
    for (const auto& row : rows) {
        teams.push_back(portus::Json::object({
            {"id", row.at(0).value()}, {"slug", row.at(1).value()},
            {"name", row.at(2).value()}, {"role", "leader"}
        }));
    }
    return portus::Json::object({{"teams", std::move(teams)}});
}

portus::Json listCcProjects(portus::DbConnection& connection, portus::DbDeadline deadline) {
    const auto rows = connection.query({
        "SELECT code, name, team_ids, to_char(synced_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') "
        "FROM project_refs WHERE removed_at IS NULL ORDER BY code", {}, portus::db_max_rows
    }, deadline);
    auto projects = portus::Json::array();
    for (const auto& row : rows) {
        projects.push_back(portus::Json::object({
            {"code", row.at(0).value()}, {"name", row.at(1).value()},
            {"teamIds", portus::Json::parse(row.at(2).value())}, {"syncedAt", row.at(3).value()}
        }));
    }
    return portus::Json::object({{"projects", std::move(projects)}});
}
}
