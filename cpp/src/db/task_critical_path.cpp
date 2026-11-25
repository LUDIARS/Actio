#include "task_critical_path.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include "task_read.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:150b43be */
#include "../../contracts/team_critical_path.hpp" /* augur-inject:contract-predicate:3e7e4e3b */

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

struct TaskNode {
    std::string id;
    std::vector<std::size_t> predecessors;
    std::vector<std::size_t> successors;
    std::string durationSource;
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
    Json cycles = Json::array();
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
        std::vector<std::string> cycle;
        std::size_t member = id;
        do {
            member = stack.back();
            stack.pop_back();
            auto& entry = nodes.at(member);
            entry.onStack = false;
            entry.cyclic = cyclic;
            if (cyclic) cycle.push_back(entry.id);
        } while (member != id);
        if (cyclic) {
            std::ranges::sort(cycle);
            auto ids = Json::array();
            for (const auto& name : cycle) ids.push_back(name);
            cycles.push_back(std::move(ids));
        }
    }
};

// Index only eligible tasks before resolving edges, so finished or foreign dependencies are ignored.
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
        node.durationSource = row.at(3).value();
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

struct Analysis {
    std::vector<std::size_t> order;
    double end;
    Json cycles;
};

bool isCritical(const TaskNode& node) {
    return !node.cyclic && std::abs(node.latest - node.earliest) < 1e-9;
}

std::vector<std::size_t> initialOrder(const std::vector<TaskNode>& nodes,
                                      std::vector<std::size_t>& remaining) {
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
    std::ranges::sort(order, {}, [&](std::size_t index) -> const std::string& {
        return nodes.at(index).id;
    });
    return order;
}

// Advance eligible nodes in the same queue order used by the Node route.
double computeEarliest(std::vector<TaskNode>& nodes, std::vector<std::size_t>& order,
                       std::vector<std::size_t>& remaining) {
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
    return end;
}

void computeLatest(std::vector<TaskNode>& nodes, const std::vector<std::size_t>& order, double end) {
    for (auto it = order.rbegin(); it != order.rend(); ++it) {
        auto& node = nodes.at(*it);
        auto finish = end;
        for (const auto successor : node.successors) {
            const auto& next = nodes.at(successor);
            if (!next.cyclic) finish = std::min(finish, next.latest);
        }
        node.latest = finish - node.days;
    }
}

Analysis analyze(std::vector<TaskNode>& nodes) {
    Components components{nodes, {}};
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        if (nodes.at(i).index == 0) components.visit(i);
    }
    std::vector<std::size_t> remaining(nodes.size(), 0);
    auto order = initialOrder(nodes, remaining);
    const auto end = computeEarliest(nodes, order, remaining);
    computeLatest(nodes, order, end);
    return {std::move(order), end, std::move(components.cycles)};
}

Json computedFields(const std::vector<TaskNode>& nodes) {
    auto changes = Json::array();
    for (const auto& node : nodes) {
        const auto slack = node.latest - node.earliest;
        changes.push_back(Json::object({
            {"id", node.id}, {"critical", isCritical(node)},
            {"slack", node.cyclic ? Json() : Json(slack)}, {"error", node.cyclic ? Json("cycle") : Json()}
        }));
    }
    return changes;
}

// Duration precedence is shared by the live response and the post-write projection.
constexpr std::string_view graphDuration = R"sql(
    CASE
        WHEN t.duration_days > 0 THEN t.duration_days
        WHEN t.estimated_minutes > 0 THEN ceil(t.estimated_minutes::numeric /
            coalesce(nullif(r.settings->>'default_daily_minutes', '')::numeric, 120))
        ELSE 1 END, CASE
        WHEN t.duration_days > 0 THEN 'duration_days'
        WHEN t.estimated_minutes > 0 THEN 'estimate'
        ELSE 'default' END
    )sql";

std::vector<TaskNode> loadGraph(DbConnection& connection, DbDeadline deadline, std::string_view team,
                                bool lockRows) {
    constexpr std::string_view target = "t.lane = 'backlog' AND t.status NOT IN ('done', 'cancelled')";
    auto sql = std::string("SELECT t.id, ");
    sql += lockRows ? "CASE WHEN " + std::string(target) + " THEN t.blocked_by END, " : "t.blocked_by, ";
    sql += graphDuration;
    sql += " FROM tasks AS t LEFT JOIN team_refs AS r ON r.id = t.team_id WHERE t.team_id = $1";
    sql += lockRows ? " ORDER BY t.id FOR UPDATE OF t"
                    : " AND " + std::string(target) + " ORDER BY t.created_at DESC, t.id";
    return buildGraph(connection.query({sql, {team}, portus::db_max_rows}, deadline));
}

void refreshTeam(DbConnection& connection, DbDeadline deadline, const std::string& team) {
    inWriteTransaction(connection, deadline, [&] {
        const auto key = "actio-critical-path:" + team;
        connection.query({"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", {key}, 1}, deadline);
        lockTaskWrites(connection, deadline);
        auto graph = loadGraph(connection, deadline, team, true);
        analyze(graph);
        const auto values = computedFields(graph).dump();
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

portus::Json readTeamCriticalPath(DbConnection& connection, DbDeadline deadline, std::string_view team) { return ::augur::invoke_observed(::augur::ContractSpec{"C-37", "fb272aa5", "src/db/task_critical_path.cpp:213"}, actio::contracts::team_critical_path, [&]() -> portus::Json { /* augur-inject:contract-wrap:fb272aa5 */
    auto graph = loadGraph(connection, deadline, team, false);
    auto analysis = analyze(graph);
    auto tasks = Json::array();
    std::vector<std::pair<double, std::string>> critical;
    for (const auto index : analysis.order) {
        const auto& node = graph.at(index);
        const bool onPath = isCritical(node);
        if (onPath) critical.emplace_back(node.earliest, node.id);
        tasks.push_back(Json::object({
            {"id", node.id}, {"slackDays", node.latest - node.earliest},
            {"earliestStart", node.earliest}, {"earliestFinish", node.earliest + node.days},
            {"durationDays", node.days}, {"durationSource", node.durationSource},
            {"isCriticalPath", onPath}
        }));
    }
    std::ranges::sort(critical);
    auto ids = Json::array();
    for (const auto& entry : critical) ids.push_back(entry.second);
    return Json::object({{"taskIds", std::move(ids)}, {"totalDays", analysis.end},
                         {"cycles", std::move(analysis.cycles)}, {"tasks", std::move(tasks)}});
}, connection, deadline, team); /* augur-inject:contract-end:fb272aa5 */ }

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
