#include "task_critical_path.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include "task_read.hpp"
#include "write_transaction.hpp"

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

struct TaskNode {
    std::string id;
    std::vector<std::size_t> predecessors;
    std::vector<std::size_t> successors;
    double days = 1;
    double earliest = 0;
    double latest = 0;
    std::size_t index = 0;
    std::size_t low = 0;
    bool onStack = false;
    bool cyclic = false;
};

struct Components {
    std::vector<TaskNode>& nodes;
    std::vector<std::size_t> stack;
    std::size_t next = 1;

    // At most portus::db_max_rows calls can nest, with each node visited once.
    void visit(std::size_t id) {
        auto& node = nodes.at(id);
        node.index = node.low = next++;
        node.onStack = true;
        stack.push_back(id);
        for (const auto pred : node.predecessors) {
            auto& previous = nodes.at(pred);
            if (previous.index == 0) {
                visit(pred);
                node.low = std::min(node.low, previous.low);
            } else if (previous.onStack) {
                node.low = std::min(node.low, previous.index);
            }
        }
        if (node.low != node.index) return;
        const bool cyclic = stack.back() != id || std::ranges::find(node.predecessors, id) != node.predecessors.end();
        std::size_t member = id;
        do {
            member = stack.back();
            stack.pop_back();
            auto& entry = nodes.at(member);
            entry.onStack = false;
            entry.cyclic = cyclic;
        } while (member != id);
    }
};

std::vector<TaskNode> buildGraph(const std::vector<portus::DbRow>& rows) {
    std::vector<TaskNode> nodes;
    std::map<std::string, std::size_t, std::less<>> ids;
    nodes.reserve(rows.size());
    for (const auto& row : rows) {
        const auto& id = row.at(0).value();
        if (row.at(1) == std::nullopt) continue;
        ids.emplace(id, nodes.size());
        TaskNode node;
        node.id = id;
        node.days = Json::parse(row.at(2).value()).as_number();
        nodes.push_back(std::move(node));
    }
    for (std::size_t index = 0; index < rows.size(); ++index) {
        const auto& row = rows.at(index);
        if (!row.at(1)) continue;
        const auto blocked = Json::parse(row.at(1).value());
        const auto nodeId = ids.at(row.at(0).value());
        auto& node = nodes.at(nodeId);
        for (const auto& pred : blocked.items()) {
            if (const auto it = ids.find(pred.as_string()); it != ids.end()) {
                node.predecessors.push_back(it->second);
                nodes.at(it->second).successors.push_back(nodeId);
            }
        }
    }
    return nodes;
}

Json analyze(std::vector<TaskNode>& nodes) {
    Components components{nodes, {}};
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        if (nodes.at(i).index == 0) components.visit(i);
    }
    std::vector<std::size_t> remaining(nodes.size(), 0);
    std::vector<std::size_t> order;
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        const auto& node = nodes.at(i);
        if (node.cyclic) continue;
        auto& count = remaining.at(i);
        for (const auto previous : node.predecessors) {
            if (!nodes.at(previous).cyclic) ++count;
        }
        if (count == 0) order.push_back(i);
    }
    double end = 0;
    for (std::size_t i = 0; i < order.size(); ++i) {
        const auto& node = nodes.at(order.at(i));
        const auto finish = node.earliest + node.days;
        end = std::max(end, finish);
        for (const auto successor : node.successors) {
            auto& next = nodes.at(successor);
            if (next.cyclic) continue;
            next.earliest = std::max(next.earliest, finish);
            if (--remaining.at(successor) == 0) order.push_back(successor);
        }
    }
    for (auto it = order.rbegin(); it != order.rend(); ++it) {
        auto& node = nodes.at(*it);
        auto finish = end;
        for (const auto successor : node.successors) {
            const auto& next = nodes.at(successor);
            if (!next.cyclic) finish = std::min(finish, next.latest);
        }
        node.latest = finish - node.days;
    }
    auto changes = Json::array();
    for (const auto& node : nodes) {
        const auto slack = node.latest - node.earliest;
        changes.push_back(Json::object({
            {"id", node.id}, {"critical", !node.cyclic && std::abs(slack) < 1e-9},
            {"slack", node.cyclic ? Json() : Json(slack)}, {"error", node.cyclic ? Json("cycle") : Json()}
        }));
    }
    return changes;
}

void refreshTeam(DbConnection& connection, DbDeadline deadline, const std::string& team) {
    inWriteTransaction(connection, deadline, [&] {
        const auto key = "actio-critical-path:" + team;
        connection.query({"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", {key}, 1}, deadline);
        lockTaskWrites(connection, deadline);
        const auto rows = connection.query({R"sql(
            SELECT t.id, CASE WHEN t.lane = 'backlog' AND t.status NOT IN ('done', 'cancelled')
                THEN t.blocked_by END, CASE
                WHEN t.duration_days > 0 THEN t.duration_days
                WHEN t.estimated_minutes > 0 THEN ceil(t.estimated_minutes::numeric /
                    coalesce(nullif(r.settings->>'default_daily_minutes', '')::numeric, 120))
                ELSE 1 END
            FROM tasks AS t LEFT JOIN team_refs AS r ON r.id = t.team_id
            WHERE t.team_id = $1 ORDER BY t.id FOR UPDATE OF t
            )sql", {team}, portus::db_max_rows}, deadline);
        auto graph = buildGraph(rows);
        const auto values = analyze(graph).dump();
        connection.query({R"sql(
            WITH computed AS (SELECT * FROM json_to_recordset($1::json)
                AS item(id text, critical boolean, slack double precision, error text)),
            desired AS (SELECT tasks.id, coalesce(computed.critical, false) AS critical,
                computed.slack, computed.error, computed.id IS NOT NULL AS target
                FROM tasks LEFT JOIN computed ON computed.id = tasks.id WHERE tasks.team_id = $2)
            UPDATE tasks SET is_critical_path = desired.critical, slack_days = desired.slack,
                critical_path_error = desired.error, critical_path_computed_at =
                CASE WHEN desired.target THEN date_trunc('milliseconds', now() AT TIME ZONE 'UTC') END
            FROM desired WHERE tasks.id = desired.id AND tasks.team_id = $2
                AND (tasks.is_critical_path, tasks.slack_days, tasks.critical_path_error)
                IS DISTINCT FROM (desired.critical, desired.slack, desired.error)
            )sql", {values, team}, 0}, deadline);
        return true;
    });
}
}

void refreshTaskCriticalPath(DbConnection& connection, DbDeadline deadline,
                             const Json& previousTeam, Json& task) {
    const auto currentTeam = task.at("teamId");
    if (previousTeam.is_null() && currentTeam.is_null()) return;
    for (const auto& team : {previousTeam, currentTeam == previousTeam ? Json() : currentTeam}) {
        if (team.as_string().empty()) continue;
        try {
            refreshTeam(connection, deadline, team.as_string());
        } catch (const std::exception&) {
            // The original task write is committed; leave derived fields for a later refresh.
            std::fputs("Actio could not refresh the team critical path\n", stderr);
        }
    }
    try {
        auto refreshed = readTaskDetail(connection, deadline, task.at("id").as_string());
        if (!refreshed.is_null()) task = std::move(refreshed);
    } catch (const std::exception&) {
        // Return the confirmed write projection if the refresh read becomes unavailable.
        std::fputs("Actio could not reload the refreshed task\n", stderr);
    }
}
}
