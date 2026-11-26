#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
// A saved membership echoes the addressed team, user and one of the two team roles.
inline const auto team_member = augur::post_only(
    [](const portus::Json& result, const portus::DbConnection&, portus::DbDeadline,
       std::string_view team, std::string_view user, const portus::Json& input) {
        const auto& member = result.at("member");
        const auto& role = member.at("role");
        return member.at("teamId") == portus::Json(team) && member.at("userId") == portus::Json(user)
            && role == input.at("role") && (role == "leader" || role == "member");
    });
}
