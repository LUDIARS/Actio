#include "task_write_rules.hpp"
#include <algorithm>
#include <regex>
#include <set>
#include "actio/local_owner.hpp"
#include "portus/util.hpp"
#include "write_input.hpp"

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

const Json& next(const Json& changes, const Json& current, std::string_view key) {
    if (const auto* value = changes.find(key)) return *value;
    return current.at(key);
}

void validateSource(const Json& changes, const Json& current) {
    const auto& source = next(changes, current, "source");
    const auto& ref = next(changes, current, "sourceRef");
    if (source.is_null() != ref.is_null())
        throw WriteError("source and source_ref must be provided together");
    if (current.at("source") == Json("praeforma-review")) {
        if (changes.find("source") || changes.find("sourceRef") || changes.find("pluginPayload"))
            throw WriteError("Pf review provenance is immutable");
    } else if (source == Json("praeforma-review")) {
        throw WriteError("Register Pf specifications through the reviewed import API");
    }
    if (source.is_null()) return;
    static const std::set<std::string_view> allowed{
        "manual", "cc-taskmd", "cc-rwf", "cc-command", "concordia.taskflow.v3", "memoria-import",
        "sprint-plan", "praeforma-review", "concordia.bounty.v1", "ingenium.playtest.v1"
    };
    if (!allowed.contains(source.as_string()))
        throw WriteError("source must be one of: manual, cc-taskmd, cc-rwf, cc-command, concordia.taskflow.v3, memoria-import, sprint-plan, praeforma-review, concordia.bounty.v1, ingenium.playtest.v1");
    const auto& value = ref.as_string();
    if (value.empty() || utf16Length(value) > 512)
        throw WriteError("source_ref must be a non-empty string of at most 512 characters");
    static const std::regex location(R"(^([a-z]:[/\\]|file:|[a-z][a-z0-9+.-]*://))", std::regex::icase);
    if (value.starts_with('/') || value.starts_with("\\\\") || value.find_first_of("\r\n") != std::string::npos
        || std::regex_search(value, location))
        throw WriteError("source_ref must be an opaque id or repository-relative path, not an absolute path or URL");
}

void normalizeDeadline(DbConnection& connection, DbDeadline deadline, Json& changes) {
    if (const auto* requested = changes.find("deadline"); requested && !requested->is_null()) {
        const auto& value = requested->as_string();
        if (value.empty() || value.size() > 128) throw WriteError("Invalid deadline");
        const auto rows = connection.query({R"sql(
            SELECT CASE WHEN $1 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([Tt ][0-9].*)?$'
                AND pg_input_is_valid($1, 'timestamp with time zone')
                THEN to_char($1::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                END
            )sql", {value}, 1}, deadline);
        if (rows.empty() || !rows.front().at(0)) throw WriteError("Invalid deadline");
        changes.set("deadline", *rows.front().at(0));
    }
}

void validateLane(Json& changes, const Json& current) {
    const auto& assignedSprint = current.at("sprintId");
    if (changes.find("sprintId") && changes.at("sprintId") != assignedSprint)
        throw WriteError(current.is_null() ? "Assign tasks through the sprint planning API"
                                          : "Change sprint membership through the sprint planning API");
    const auto& lane = next(changes, current, "lane");
    const auto& duration = next(changes, current, "durationDays");
    if (!assignedSprint.is_null() && (next(changes, current, "teamId") != current.at("teamId")
        || lane != current.at("lane")))
        throw WriteError("Remove the task from its sprint before changing team or lane", 409);
    if (changes.find("lane")) {
        if (lane != Json("daily") && lane != Json("backlog"))
            throw WriteError("lane must be daily or backlog");
        if (current.at("lane") == Json("daily") && lane == Json("backlog")
            && changes.at("deadline").is_null() && duration.is_null())
            throw WriteError("daily to backlog requires deadline or duration_days");
        if (current.at("lane") == Json("backlog") && lane == Json("daily"))
            changes.set("deadline", Json());
    } else if (current.is_null() || (changes.find("durationDays") && lane == Json("daily"))) {
        const auto inferred = duration.is_null() ? Json("daily") : Json("backlog");
        if (!assignedSprint.is_null() && inferred != lane)
            throw WriteError("Remove the task from its sprint before changing team or lane", 409);
        changes.set("lane", inferred);
    }
}

bool isTeamMember(DbConnection& connection, DbDeadline deadline, std::string_view team,
                  std::string_view user) {
    return !connection.query({
        "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2", {team, user}, 1
    }, deadline).empty();
}

void validateTeam(DbConnection& connection, DbDeadline deadline, const Json& changes,
                  const Json& current, bool requireMembership = false) {
    const auto& team = next(changes, current, "teamId");
    if (team.is_null()) return;
    if (team.as_string().empty()) throw WriteError("team_id must be a non-empty string");
    const auto& assignee = next(changes, current, "assigneeId").as_string();
    if (assignee.empty()) throw WriteError("assignee_id is required for team tasks");
    const auto rows = connection.query({
        "SELECT settings->>'input_mode' FROM team_refs WHERE id = $1", {team.as_string()}, 1
    }, deadline);
    const bool member = requireMembership
        ? isTeamMember(connection, deadline, team.as_string(), assignee)
        : validTaskAssignee(connection, deadline, team.as_string(), assignee);
    if ((rows.empty() && assignee == local_owner_id) || !member)
        throw WriteError("assignee_id must be a team member");
    if (rows.empty()) throw WriteError("Forbidden", 403);
    const auto& lane = next(changes, current, "lane");
    const auto& due = next(changes, current, "deadline");
    if (lane == Json("backlog") && rows.front().at(0) == "full" && due.is_null())
        throw WriteError("deadline is required for full backlog input");
    if (lane == Json("daily") && !due.is_null()) throw WriteError("daily tasks cannot have a deadline");
    const auto& blocked = next(changes, current, "blockedBy");
    for (const auto& id : blocked.items()) {
        if (id == current.at("id")) throw WriteError("blocked_by cannot reference itself");
    }
    if (!blocked.items().empty()) {
        const auto encoded = blocked.dump();
        if (!connection.query({R"sql(
            SELECT 1 FROM json_array_elements_text($1::json) AS dependency(id)
            WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = dependency.id AND team_id = $2)
            LIMIT 1
            )sql", {encoded, team.as_string()}, 1}, deadline).empty())
            throw WriteError("blocked_by tasks must belong to the same team");
    }
}

std::vector<std::string> commaLabels(std::string_view category) {
    std::vector<std::string> labels{"一時登録", "要整理"};
    std::set<std::string, std::less<>> seen(labels.begin(), labels.end());
    while (!category.empty()) {
        const auto separator = category.find(',');
        const auto label = portus::trim(category.substr(0, separator));
        if (!label.empty() && seen.emplace(label).second)
            labels.emplace_back(label);
        if (separator == std::string_view::npos) break;
        category.remove_prefix(separator + 1);
    }
    return labels;
}

void applyProject(DbConnection& connection, DbDeadline deadline, Json& changes, const Json& current) {
    if (!current.is_null() && !changes.find("projectId") && !changes.find("teamId")) return;
    const auto& project = next(changes, current, "projectId").as_string();
    const auto& team = next(changes, current, "teamId").as_string();
    std::vector<portus::DbRow> rows;
    if (!project.empty())
        rows = connection.query({"SELECT team_ids, removed_at FROM project_refs WHERE code = $1",
                                 {project}, 1}, deadline);
    const bool active = !rows.empty() && !rows.front().at(1);
    const auto teams = active ? Json::parse(rows.front().at(0).value()) : Json::array();
    if (!team.empty() && !project.empty()) {
        if (!active) throw WriteError("project_id must be a Concordia project code");
        if (std::find(teams.items().begin(), teams.items().end(), Json(team)) == teams.items().end())
            throw WriteError("project_id must belong to the task's team in Concordia");
    }
    if (current.is_null() && team.empty() && teams.items().empty()
        && (!rows.empty() || changes.at("source") == Json("concordia.taskflow.v3"))) {
        std::string category;
        for (const auto& label : commaLabels(changes.at("category").as_string())) {
            if (!category.empty()) category += ", ";
            category += label;
        }
        changes.set("category", category);
    }
}
}

bool validTaskAssignee(DbConnection& connection, DbDeadline deadline, std::string_view team,
                       std::string_view assignee) {
    return assignee == local_owner_id || isTeamMember(connection, deadline, team, assignee);
}

void validateTaskWrite(DbConnection& connection, DbDeadline deadline, Json& changes, const Json& current) {
    validateSource(changes, current);
    normalizeDeadline(connection, deadline, changes);
    if (changes.find("deadline") && current.at("creatorType") == Json("ai")
        && current.at("deadline") != changes.at("deadline") && !changes.find("creatorType"))
        changes.set("creatorType", "human");
    validateLane(changes, current);
    if (current.is_null()) applyProject(connection, deadline, changes, current);
    validateTeam(connection, deadline, changes, current);
    if (!current.is_null()) applyProject(connection, deadline, changes, current);
}

namespace {
// Read only the lane endpoint's fields, accepting both duration spellings like Node.
Json laneChanges(DbConnection& connection, DbDeadline deadline, const Json& input) {
    const auto& lane = input.at("lane");
    if (lane != "daily" && lane != "backlog") throw WriteError("lane must be daily or backlog");
    auto changes = Json::object({{"lane", lane}});
    if (const auto* due = input.find("deadline")) {
        if (!due->is_null() && !validString(*due)) throw WriteError("Invalid deadline");
        changes.set("deadline", *due);
        normalizeDeadline(connection, deadline, changes);
    }
    const auto* duration = input.find("durationDays");
    if (!duration) duration = input.find("duration_days");
    if (duration) {
        if (!duration->is_null() && !isInteger(*duration, 1))
            throw WriteError("duration_days must be a positive integer");
        changes.set("durationDays", *duration);
    }
    return changes;
}
}

Json validateTaskLaneChange(DbConnection& connection, DbDeadline deadline, const Json& input,
                            const Json& current) {
    const auto& team = current.at("teamId").as_string();
    if (!isTeamMember(connection, deadline, team, local_owner_id)) throw WriteError("Forbidden", 403);
    auto changes = laneChanges(connection, deadline, input);
    const Json lane = changes.at("lane");
    if (current.at("lane") == "daily" && lane == "backlog"
        && changes.at("deadline").is_null() && changes.at("durationDays").is_null())
        throw WriteError("daily to backlog requires deadline or duration_days");
    if (current.at("lane") == "backlog" && lane == "daily") {
        if (!current.at("sprintId").is_null())
            throw WriteError("backlog tasks in a sprint cannot move to daily");
        changes.set("deadline", Json());
    }
    validateTeam(connection, deadline, changes, current, true);
    return changes;
}
}
